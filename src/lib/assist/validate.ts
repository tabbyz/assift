import { addDays, wday } from '@/lib/calendar/dateString'
import { cellKey } from '@/lib/shifts/key'
import {
  capacityAt,
  isWorkday,
  slotKey,
  weekDates,
  type PlanRow,
  type Problem,
  type Restriction,
} from './problem'

/**
 * 検証器（012 §5.3）。**保存されるシフトがハード制約に 1 件も違反しないことを、ここが保証する。**
 *
 * ソルバーの解も LLM の出力も「候補」で、ここを通ったものだけを書く。MILP が正しければ何も落ちないが、
 * モデルのバグを黙って保存しないための門番（落ちた行は `rejected` に残す）。
 */

export type ViolationCode =
  'H1' | 'H2' | 'H3' | 'H4' | 'H5' | 'H6' | 'H7' | 'H8' | 'H9' | 'H10' | 'H11'

/** `rule` は理由の集計でまとめる短い名前（H5〜H9 だけ。例: `週上限（5日）` / `「夜勤は1週間に1日まで」`） */
export type Violation = { code: ViolationCode; message: string; rule?: string }

/** 親とペアは 1 単位で受理・棄却する（片方だけを保存しない。`assign_shift` を 1 トランザクションにしたのと同じ理由） */
export type PlanUnit = { parent: PlanRow; pair: PlanRow | null }

export type RejectedUnit = { rows: PlanRow[]; violations: Violation[] }

export type ValidationResult = { accepted: PlanRow[]; rejected: RejectedUnit[] }

/**
 * 既存 + 受理済みの状態。検証（逐次受理）と理由の集計（「最終の解に入れたら何が壊れるか」）が共有する。
 */
export class PlanState {
  private readonly cells = new Map<string, string>()
  private readonly placed = new Map<string, number>()

  constructor(private readonly problem: Problem) {
    for (const [key, patternId] of problem.existing) this.cells.set(key, patternId)
  }

  occupant(staffId: string, date: string): string | undefined {
    return this.cells.get(cellKey(staffId, date))
  }

  /** 新しく入れた行の (date, pattern) ごとの数（H10） */
  placedAt(date: string, patternId: string): number {
    return this.placed.get(slotKey(date, patternId)) ?? 0
  }

  add(row: PlanRow): void {
    this.cells.set(cellKey(row.staffId, row.date), row.patternId)
    if (isWorkday(this.problem, row.patternId)) {
      const key = slotKey(row.date, row.patternId)
      this.placed.set(key, (this.placed.get(key) ?? 0) + 1)
    }
  }
}

/** 制約の 1 行（describe.ts の `describeRestriction` と同じ言い回し。正規化済みの制約から作る） */
export function restrictionLabel(problem: Problem, restriction: Restriction): string {
  const name = (id: string | null) => (id ? (problem.patternById.get(id)?.name ?? '?') : '勤務日')
  switch (restriction.kind) {
    case 'deny_pattern_pair':
      return `${name(restriction.pattern1Id)}の翌日は${name(restriction.pattern2Id)}にしない`
    case 'max_work_week':
      return `${name(restriction.patternId)}は1週間に${restriction.days}日まで`
    case 'max_work_consecutive':
      return `${name(restriction.patternId)}は連続で${restriction.days}日まで`
    case 'sat_or_sun_dayoff':
      return '土日のどちらかは休み'
  }
}

/** 親に対して正しいペアの行か（スタッフ・翌日・ペア先のパターン） */
function isPairOf(problem: Problem, parent: PlanRow, pair: PlanRow): boolean {
  return (
    pair.staffId === parent.staffId &&
    pair.date === addDays(parent.date, 1) &&
    pair.patternId === problem.patternById.get(parent.patternId)?.pairPatternId
  )
}

/**
 * H11（参照の妥当性）。在籍スタッフだけ、`'assign'` はこの店舗の出勤日パターンで P 内の日付、
 * `'pair'` は親のペア先パターンで親の翌日。ペアを持つパターンにペアの行が無い単位も通さない。
 */
function referenceViolations(problem: Problem, unit: PlanUnit): Violation[] {
  const { parent, pair } = unit
  const pattern = problem.patternById.get(parent.patternId)
  if (!problem.staffById.has(parent.staffId)) {
    return [{ code: 'H11', message: '在籍スタッフではありません' }]
  }
  if (!pattern || pattern.kind !== 'workday') {
    return [{ code: 'H11', message: 'この店舗の勤務日のパターンではありません' }]
  }
  if (parent.date < problem.period.start || parent.date > problem.period.end) {
    return [{ code: 'H11', message: '対象期間の外の日付です' }]
  }
  if (pattern.pairPatternId && !pair) {
    return [{ code: 'H11', message: 'ペアの行がありません' }]
  }
  if (pair && !isPairOf(problem, parent, pair)) {
    return [{ code: 'H11', message: 'ペアの行が親と合いません' }]
  }
  return []
}

/** 連続する日数（date を含む）。`matches` を満たす日が前後に何日続くか。前後それぞれ limit + 1 日まで辿れば足りる */
function runLength(date: string, limit: number, matches: (date: string) => boolean): number {
  let length = 1
  for (let offset = 1; offset <= limit + 1 && matches(addDays(date, -offset)); offset++) length++
  for (let offset = 1; offset <= limit + 1 && matches(addDays(date, offset)); offset++) length++
  return length
}

/**
 * 単位を今の状態に足したときの違反（012 §5.3 の H1〜H11）。空配列なら受理できる。
 *
 * 検証器の逐次受理と、理由の集計（reasons.ts）が同じ関数を使う。判定は「足したあとの状態で、足した行が関わる制約が
 * 満たされるか」。既存だけで既に違反している週・窓に新しい行を足すと違反になる（MILP の `max(0, 上限 − 既存)` と同じ）。
 */
export function unitViolations(problem: Problem, state: PlanState, unit: PlanUnit): Violation[] {
  const reference = referenceViolations(problem, unit)
  if (reference.length > 0) return reference

  const rows = unit.pair ? [unit.parent, unit.pair] : [unit.parent]
  const staff = problem.staffById.get(unit.parent.staffId)!
  const violations: Violation[] = []

  // H1 / H2: 空きセルだけ（下書きも確定も上書きしない）。ペアの翌日も空いていること
  if (state.occupant(unit.parent.staffId, unit.parent.date) !== undefined) {
    violations.push({ code: 'H1', message: 'すでにシフトが入っています' })
  }
  if (unit.pair && state.occupant(unit.pair.staffId, unit.pair.date) !== undefined) {
    violations.push({ code: 'H2', message: 'ペアの翌日にシフトが入っています' })
  }
  // H3 / H4 は親だけ（ペアは assign_shift と同じく翌日を無条件に書く）
  if (!staff.availableWdays.has(wday(unit.parent.date))) {
    violations.push({ code: 'H3', message: '勤務できない曜日です' })
  }
  if (!staff.patternIds.has(unit.parent.patternId)) {
    violations.push({ code: 'H4', message: '選択できない勤務パターンです' })
  }
  // H10: 必要人数を超えない。ペアで入る出勤日の行も数える（2026-09-26 決定）
  for (const row of rows) {
    if (!isWorkday(problem, row.patternId)) continue
    if (
      state.placedAt(row.date, row.patternId) + 1 >
      capacityAt(problem, row.date, row.patternId)
    ) {
      violations.push({
        code: 'H10',
        message: row.source === 'pair' ? 'ペア先に枠がありません' : '必要人数を超えます',
      })
    }
  }
  if (violations.length > 0) return violations

  const byDate = new Map(rows.map((row) => [row.date, row.patternId]))
  const occupant = (date: string) => byDate.get(date) ?? state.occupant(unit.parent.staffId, date)
  const works = (date: string) => isWorkday(problem, occupant(date))
  const workRows = rows.filter((row) => isWorkday(problem, row.patternId))

  // H5: 週の勤務日数（既存 + 新規 + 出勤日のペア）≤ max_work_week
  const checkedWeeks = new Set<string>()
  for (const row of workRows) {
    const week = weekDates(row.date, problem.startOfWeek)
    if (checkedWeeks.has(week[0])) continue
    checkedWeeks.add(week[0])
    const count = week.filter(works).length
    if (count > staff.maxWorkWeek) {
      violations.push({
        code: 'H5',
        message: `週の勤務日数の上限（${staff.maxWorkWeek}日）を超えます`,
        rule: `週上限（${staff.maxWorkWeek}日）`,
      })
    }
  }

  for (const restriction of problem.restrictions) {
    if (!restriction.hard) continue
    const label = restrictionLabel(problem, restriction)

    switch (restriction.kind) {
      case 'deny_pattern_pair': {
        const broken = rows.some(
          (row) =>
            (row.patternId === restriction.pattern2Id &&
              occupant(addDays(row.date, -1)) === restriction.pattern1Id) ||
            (row.patternId === restriction.pattern1Id &&
              occupant(addDays(row.date, 1)) === restriction.pattern2Id)
        )
        if (broken)
          violations.push({ code: 'H6', message: `「${label}」に反します`, rule: `「${label}」` })
        break
      }
      case 'max_work_week': {
        const weeks = new Map<string, string[]>()
        for (const row of rows) {
          if (row.patternId !== restriction.patternId) continue
          const week = weekDates(row.date, problem.startOfWeek)
          weeks.set(week[0], week)
        }
        const broken = [...weeks.values()].some(
          (week) =>
            week.filter((date) => occupant(date) === restriction.patternId).length >
            restriction.days
        )
        if (broken)
          violations.push({ code: 'H7', message: `「${label}」に反します`, rule: `「${label}」` })
        break
      }
      case 'max_work_consecutive': {
        const matches = (date: string) =>
          restriction.patternId === null ? works(date) : occupant(date) === restriction.patternId
        const broken = rows.some(
          (row) =>
            matches(row.date) && runLength(row.date, restriction.days, matches) > restriction.days
        )
        if (broken)
          violations.push({ code: 'H8', message: `「${label}」に反します`, rule: `「${label}」` })
        break
      }
      case 'sat_or_sun_dayoff': {
        const broken = workRows.some((row) => {
          const day = wday(row.date)
          if (day === 6) return works(addDays(row.date, 1))
          if (day === 0) return works(addDays(row.date, -1))
          return false
        })
        if (broken)
          violations.push({ code: 'H9', message: `「${label}」に反します`, rule: `「${label}」` })
        break
      }
    }
  }

  return violations
}

/** 行の並びを単位（親 + ペア）に組む。親の無いペアの行は H11 で落とす */
function toUnits(
  problem: Problem,
  plan: PlanRow[]
): { units: { unit: PlanUnit; index: number }[]; orphans: RejectedUnit[] } {
  const pairs = plan.filter((row) => row.source === 'pair')
  const used = new Set<PlanRow>()
  const units: { unit: PlanUnit; index: number }[] = []

  plan.forEach((row, index) => {
    if (row.source !== 'assign') return
    const pair = pairs.find(
      (candidate) => !used.has(candidate) && isPairOf(problem, row, candidate)
    )
    if (pair) used.add(pair)
    units.push({ unit: { parent: row, pair: pair ?? null }, index })
  })

  const orphans = pairs
    .filter((row) => !used.has(row))
    .map((row) => ({
      rows: [row],
      violations: [{ code: 'H11' as const, message: '親の行が無いペアの行です' }],
    }))
  return { units, orphans }
}

/**
 * 逐次受理（012 §5.3）。単位を (date, pattern, 入力順) で並べ、既存 + 受理済みに対して H1〜H11 を満たすものだけ受理する。
 * 常に部分集合を返すので、「保存される集合はどの順で見ても違反 0」が保証される。
 */
export function validatePlan(problem: Problem, plan: PlanRow[]): ValidationResult {
  const { units, orphans } = toUnits(problem, plan)
  const patternOrder = new Map(problem.patterns.map((pattern, index) => [pattern.id, index]))
  units.sort(
    (a, b) =>
      a.unit.parent.date.localeCompare(b.unit.parent.date) ||
      (patternOrder.get(a.unit.parent.patternId) ?? 0) -
        (patternOrder.get(b.unit.parent.patternId) ?? 0) ||
      a.index - b.index
  )

  const state = new PlanState(problem)
  const accepted: PlanRow[] = []
  const rejected: RejectedUnit[] = [...orphans]

  for (const { unit } of units) {
    const rows = unit.pair ? [unit.parent, unit.pair] : [unit.parent]
    const violations = unitViolations(problem, state, unit)
    if (violations.length > 0) {
      rejected.push({ rows, violations })
      continue
    }
    for (const row of rows) {
      state.add(row)
      accepted.push(row)
    }
  }

  return { accepted, rejected }
}

/** 受理済みの計画から状態を組み直す（理由の集計・指示の評価用） */
export function stateOf(problem: Problem, plan: PlanRow[]): PlanState {
  const state = new PlanState(problem)
  for (const row of plan) state.add(row)
  return state
}
