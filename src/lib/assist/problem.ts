import { addDays, datesBetween, wday } from '@/lib/calendar/dateString'
import type { DayKey } from '@/lib/calendar/weekdays'
import type { PatternKind } from '@/lib/patterns/kinds'
import { normalizeWdays, type RestrictionKind } from '@/lib/restrictions/kinds'
import { cellKey } from '@/lib/shifts/key'
import type { RequiredNumRow } from '@/lib/shifts/satisfaction'

/**
 * 自動アサインの問題（012 §5.2）。DB の行 → `buildProblem()` → `Problem`。
 *
 * ここから先（model / validate / reasons）は LLM もソルバーも知らない純関数で、Vitest で固定する。
 * 用語: P = 対象期間（表示期間）、C = 文脈期間（週上限・連勤・ペアの判定に要る前後の既存シフト）。
 */

export type AssistStaffInput = {
  id: string
  name: string
  availableWdays: number[]
  maxWorkWeek: number
  patternIds: string[]
  defaults: Partial<Record<DayKey, string>>
}

export type AssistPatternInput = {
  id: string
  name: string
  kind: PatternKind
  pairPatternId: string | null
}

export type AssistRestrictionInput = {
  id: string
  kind: RestrictionKind
  days: number | null
  pattern1Id: string | null
  pattern2Id: string | null
  /** null = 店舗全体（013 §3.2） */
  staffId: string | null
  /** 必須 = true / なるべく = false */
  hard: boolean
  wdays: number[] | null
}

export type ExistingShift = { staffId: string; date: string; patternId: string }

export type AssistInput = {
  period: { start: string; end: string }
  startOfWeek: number
  /** 祝日（C の範囲で足りる。土日祝の偏りとデフォルト勤務パターンの曜日キーに使う） */
  holidays: string[]
  /** 在籍スタッフだけ（表示順） */
  staffs: AssistStaffInput[]
  patterns: AssistPatternInput[]
  restrictions: AssistRestrictionInput[]
  /** P と P.end + 1（ペアの着地日の H10 判定に要る） */
  requiredNums: RequiredNumRow[]
  /** C の既存シフト。在籍スタッフの行だけ */
  shifts: ExistingShift[]
}

/**
 * 制約（H6〜H9・H12 と、下限・なるべく休みのソフト項の元）。`hard` は DB の列の素通し（013。012 §3.9 の想定どおり）。
 * `staffId` が null なら在籍スタッフ全員、値があればその人だけに効く。
 */
export type Restriction = { id: string; staffId: string | null; hard: boolean } & (
  | { kind: 'deny_pattern_pair'; pattern1Id: string; pattern2Id: string }
  | { kind: 'max_work_week'; patternId: string; days: number }
  | { kind: 'max_work_consecutive'; patternId: string | null; days: number }
  | { kind: 'sat_or_sun_dayoff' }
  /** 期間に丸ごと入る週ごとの勤務日数 ≥ days（指示の `min_workdays` の週と同じ） */
  | { kind: 'min_work_week'; days: number }
  /** 期間の土日祝の勤務日数 ≤ days（指示の `limit_weekends` と同じ数え方） */
  | { kind: 'max_weekend_days'; days: number }
  /** その曜日に勤務しない（常にソフト。指示の `prefer_off` と同じ） */
  | { kind: 'prefer_dayoff_wdays'; wdays: number[] }
)

export type ProblemStaff = {
  id: string
  name: string
  /** 画面や LLM に出すコード（`S1`〜）。表示順 */
  code: string
  availableWdays: Set<number>
  maxWorkWeek: number
  patternIds: Set<string>
  defaults: Partial<Record<DayKey, string>>
}

export type ProblemPattern = {
  id: string
  name: string
  code: string
  kind: PatternKind
  /** 店舗に実在するペア先だけ（消えたパターンを指す値は null に落とす） */
  pairPatternId: string | null
}

/** 埋める枠（P 内の出勤日パターン × 日付で、必要人数 − 配置済み > 0） */
export type Slot = { date: string; patternId: string; count: number }

export type Problem = {
  period: { start: string; end: string }
  /** P の日付（両端を含む） */
  dates: string[]
  /** P.end + 1。ペアの行はここまで書く（`assign_shift` と同じ） */
  landingDate: string
  context: { start: string; end: string }
  startOfWeek: number
  holidays: Set<string>
  staffs: ProblemStaff[]
  staffById: Map<string, ProblemStaff>
  patterns: ProblemPattern[]
  patternById: Map<string, ProblemPattern>
  restrictions: Restriction[]
  /** C の既存シフト。`cellKey(staffId, date)` → patternId */
  existing: Map<string, string>
  /** (date, pattern) → 残りの枠数 `max(0, required − assigned)`。P と着地日の出勤日パターンだけ。無い = 0 */
  capacity: Map<string, number>
  /** P の不足枠（capacity > 0）。日付 → パターンの表示順 */
  demand: Slot[]
  /** 不足枠の合計（「n / m 枠」の分母） */
  requested: number
}

export function slotKey(date: string, patternId: string): string {
  return `${date}|${patternId}`
}

/**
 * 文脈期間 C（012 §5.3）。
 *
 * プランの定義は `[min(週初(P.start), P.start − 7), max(週末(P.end), P.end + 7)]`。週初は P.start − 6 より前に
 * ならないので左端は常に P.start − 7。右端はペアの着地日（P.end + 1）を起点に数え直し、
 * `days ≤ 7` の連勤の窓（長さ 8）が着地日を含んでも末尾まで既存を読めるよう P.end + 8 にする。
 */
export function contextRange(period: { start: string; end: string }): {
  start: string
  end: string
} {
  return { start: addDays(period.start, -7), end: addDays(period.end, 8) }
}

/** 必要人数を読む範囲。着地日の H10 判定のため P + 1 日 */
export function requiredNumsRange(period: { start: string; end: string }): {
  start: string
  end: string
} {
  return { start: period.start, end: addDays(period.end, 1) }
}

/** その日を含む週の初日（店舗の `start_of_week` 基準） */
export function weekStart(date: string, startOfWeek: number): string {
  return addDays(date, -((wday(date) - startOfWeek + 7) % 7))
}

/** その週の 7 日 */
export function weekDates(date: string, startOfWeek: number): string[] {
  const from = weekStart(date, startOfWeek)
  return datesBetween(from, addDays(from, 6))
}

/** 土日祝（公平性の「土日祝の偏り」と指示の `limit_weekends` が数える日） */
export function isWeekendOrHoliday(problem: Problem, date: string): boolean {
  const day = wday(date)
  return day === 0 || day === 6 || problem.holidays.has(date)
}

/**
 * restrictions を正規化する。参照先のパターンが店舗に無い行・日数や曜日が欠けた行は捨てる
 * （v1 から移行した行に欠けがありうる。describe.ts の `?` 表示と同じ前提）。
 * 在籍でないスタッフの規則も捨てる（退職しても規則は残す。013 §3.8）。なるべく休みの曜日は常にソフト（DB の CHECK と同じ）。
 */
function normalizeRestrictions(
  rows: AssistRestrictionInput[],
  patternIds: Set<string>,
  staffIds: Set<string>
): Restriction[] {
  const known = (id: string | null): id is string => id !== null && patternIds.has(id)
  const result: Restriction[] = []

  for (const row of rows) {
    if (row.staffId !== null && !staffIds.has(row.staffId)) continue
    const base = { id: row.id, staffId: row.staffId, hard: row.hard }

    switch (row.kind) {
      case 'deny_pattern_pair':
        if (known(row.pattern1Id) && known(row.pattern2Id)) {
          result.push({
            ...base,
            kind: row.kind,
            pattern1Id: row.pattern1Id,
            pattern2Id: row.pattern2Id,
          })
        }
        break
      case 'max_work_week':
        if (known(row.pattern1Id) && row.days !== null) {
          result.push({ ...base, kind: row.kind, patternId: row.pattern1Id, days: row.days })
        }
        break
      case 'max_work_consecutive':
        // pattern1 は任意（null = 勤務日全体）。指定があるのに店舗に無いなら捨てる
        if (row.days !== null && (row.pattern1Id === null || known(row.pattern1Id))) {
          result.push({ ...base, kind: row.kind, patternId: row.pattern1Id, days: row.days })
        }
        break
      case 'sat_or_sun_dayoff':
        result.push({ ...base, kind: row.kind })
        break
      case 'min_work_week':
      case 'max_weekend_days':
        if (row.days !== null) result.push({ ...base, kind: row.kind, days: row.days })
        break
      case 'prefer_dayoff_wdays': {
        const wdays = normalizeWdays(row.wdays)
        if (wdays.length > 0) result.push({ ...base, hard: false, kind: row.kind, wdays })
        break
      }
    }
  }

  return result
}

/** その制約が効くスタッフ（店舗全体なら在籍スタッフ全員。表示順） */
export function restrictionStaffs(problem: Problem, restriction: Restriction): ProblemStaff[] {
  if (restriction.staffId === null) return problem.staffs
  const staff = problem.staffById.get(restriction.staffId)
  return staff ? [staff] : []
}

/** 日付の並びがかかる週（`start_of_week` 基準の 7 日。日付の順）。週上限・週の上限の制約・指示の週が共有する */
export function allWeeks(
  problem: Pick<Problem, 'startOfWeek'>,
  dates: readonly string[]
): string[][] {
  const weeks = new Map<string, string[]>()
  for (const date of dates) {
    const week = weekDates(date, problem.startOfWeek)
    weeks.set(week[0], week)
  }
  return [...weeks.values()]
}

/**
 * 期間に丸ごと入る週（`start_of_week` 基準）。週の下限（`min_work_week` と指示の `min_workdays`）はここだけで数える:
 * 期間の外の日は動かせないので、端の週に下限を課すと守れない（012 §10.3）
 */
export function fullWeeks(problem: Problem): string[][] {
  return allWeeks(problem, problem.dates).filter(
    (week) => week[0] >= problem.period.start && week[week.length - 1] <= problem.period.end
  )
}

/**
 * DB の行から問題を組む（012 §5.2 / §5.3）。
 *
 * - 不足枠は出勤日パターンだけ（`satisfaction.ts` と同じ）。`required − assigned` が 0 以下の組は枠にしない
 * - 配置済みの人数は在籍スタッフの既存シフトから数える（表のフッターと同じ母集団）
 * - 着地日（P.end + 1）の残り枠も持つ。ペアで翌日に入る出勤日パターンの H10 判定に使う
 */
export function buildProblem(input: AssistInput): Problem {
  const dates = datesBetween(input.period.start, input.period.end)
  const landingDate = addDays(input.period.end, 1)

  const patternIds = new Set(input.patterns.map((pattern) => pattern.id))
  const patterns: ProblemPattern[] = input.patterns.map((pattern, index) => ({
    id: pattern.id,
    name: pattern.name,
    code: `P${index + 1}`,
    kind: pattern.kind,
    pairPatternId:
      pattern.pairPatternId && patternIds.has(pattern.pairPatternId) ? pattern.pairPatternId : null,
  }))
  const patternById = new Map(patterns.map((pattern) => [pattern.id, pattern]))

  const staffs: ProblemStaff[] = input.staffs.map((staff, index) => ({
    id: staff.id,
    name: staff.name,
    code: `S${index + 1}`,
    availableWdays: new Set(staff.availableWdays),
    maxWorkWeek: staff.maxWorkWeek,
    // 消えたパターンを指す値は落とす（H4 の候補に出さない）
    patternIds: new Set(staff.patternIds.filter((id) => patternIds.has(id))),
    defaults: staff.defaults,
  }))
  const staffById = new Map(staffs.map((staff) => [staff.id, staff]))
  const staffIds = new Set(staffById.keys())

  const existing = new Map<string, string>()
  const assigned = new Map<string, number>()
  for (const shift of input.shifts) {
    if (!staffById.has(shift.staffId) || !patternById.has(shift.patternId)) continue
    existing.set(cellKey(shift.staffId, shift.date), shift.patternId)
    const key = slotKey(shift.date, shift.patternId)
    assigned.set(key, (assigned.get(key) ?? 0) + 1)
  }

  const workdayIds = new Set(patterns.filter((p) => p.kind === 'workday').map((p) => p.id))
  const inScope = new Set([...dates, landingDate])
  const capacity = new Map<string, number>()
  for (const row of input.requiredNums) {
    if (!workdayIds.has(row.patternId) || !inScope.has(row.date)) continue
    const key = slotKey(row.date, row.patternId)
    const remaining = row.num - (assigned.get(key) ?? 0)
    if (remaining > 0) capacity.set(key, remaining)
  }

  const demand: Slot[] = []
  for (const date of dates) {
    for (const pattern of patterns) {
      const count = capacity.get(slotKey(date, pattern.id)) ?? 0
      if (count > 0) demand.push({ date, patternId: pattern.id, count })
    }
  }

  return {
    period: { ...input.period },
    dates,
    landingDate,
    context: contextRange(input.period),
    startOfWeek: input.startOfWeek,
    holidays: new Set(input.holidays),
    staffs,
    staffById,
    patterns,
    patternById,
    restrictions: normalizeRestrictions(input.restrictions, patternIds, staffIds),
    existing,
    capacity,
    demand,
    requested: demand.reduce((sum, slot) => sum + slot.count, 0),
  }
}

export function isWorkday(problem: Problem, patternId: string | undefined): boolean {
  return patternId !== undefined && problem.patternById.get(patternId)?.kind === 'workday'
}

export function capacityAt(problem: Problem, date: string, patternId: string): number {
  return problem.capacity.get(slotKey(date, patternId)) ?? 0
}

/** 候補から外れる理由（既存シフトだけで決まるもの）。H1〜H4 と、ペアの翌日（H2 / H10） */
export type StaticBlock = 'occupied' | 'wday' | 'pattern' | 'pair_occupied' | 'pair_no_slot'

/**
 * そのスタッフを (date, pattern) に置けるか、**既存シフトだけ**を見て判定する（012 §5.3 の H1〜H4 と H2 / H10 のペア部分）。
 * MILP はここを通った組にだけ変数を作り、理由の集計（reasons.ts）は「候補」をここで数える。
 * 週上限や連勤（H5〜H9）は新しく入れる行どうしの関係で決まるので、ここでは見ない。
 */
export function staticBlock(
  problem: Problem,
  staff: ProblemStaff,
  date: string,
  patternId: string
): StaticBlock | null {
  if (problem.existing.has(cellKey(staff.id, date))) return 'occupied'
  if (!staff.availableWdays.has(wday(date))) return 'wday'
  if (!staff.patternIds.has(patternId)) return 'pattern'

  const pairId = problem.patternById.get(patternId)?.pairPatternId
  if (pairId) {
    const next = addDays(date, 1)
    if (problem.existing.has(cellKey(staff.id, next))) return 'pair_occupied'
    if (isWorkday(problem, pairId) && capacityAt(problem, next, pairId) === 0) return 'pair_no_slot'
  }
  return null
}

/** 割り当ての 1 行。**ペアの行も明示的に含める**（validate・upsert・件数の分子が同じ集合を見る。012 §5.1） */
export type PlanRow = {
  staffId: string
  date: string
  patternId: string
  source: 'assign' | 'pair'
}

/** 親の行からペアの行を作る（翌日に入る。`assign_shift` と同じ） */
export function withPair(problem: Problem, row: Omit<PlanRow, 'source'>): PlanRow[] {
  const parent: PlanRow = { ...row, source: 'assign' }
  const pairId = problem.patternById.get(row.patternId)?.pairPatternId
  if (!pairId) return [parent]
  return [
    parent,
    { staffId: row.staffId, date: addDays(row.date, 1), patternId: pairId, source: 'pair' },
  ]
}
