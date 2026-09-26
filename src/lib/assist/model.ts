import { addDays, datesBetween, wday } from '@/lib/calendar/dateString'
import { dayKeyFor } from '@/lib/calendar/weekdays'
import { cellKey } from '@/lib/shifts/key'
import { addDirective, type Directive, type DirectiveModelContext } from './directives'
import { Linear, LpBuilder, row } from './lp'
import {
  capacityAt,
  isWeekendOrHoliday,
  isWorkday,
  slotKey,
  staticBlock,
  weekDates,
  withPair,
  type PlanRow,
  type Problem,
  type Slot,
} from './problem'
import { WEIGHTS, type Weights } from './weights'

/**
 * ハード制約（H1〜H10）とソフト目標を MILP に写す（012 §5.3 / §5.4）。LP 形式の文字列を組むだけの純関数。
 *
 * 変数 `x[s,d,p]`（0/1）は `staticBlock()` を通った組（既存シフトだけで決まる H1〜H4 とペアの翌日）にだけ作る。
 * ペアで翌日に入る行は新しい変数を作らず、**親の変数を着地日のそのパターンの項として数える**（H5〜H10 共通）。
 */

export type ModelOptions = {
  directives?: Directive[]
  /** 「別の案を作る」の前の案（`result.plan`）。同じセルにペナルティ（§3.10） */
  previousPlan?: PlanRow[]
  /** ハードな指示をすべてソフトに落とした 2 回目（§3.9） */
  relaxDirectives?: boolean
  weights?: Weights
}

export type ModelCell = { staffId: string; date: string; patternId: string }

export type AssistModel = {
  builder: LpBuilder
  /** 変数名 → セル */
  cells: Map<string, ModelCell>
  /** 不足変数の名前 → 枠 */
  shortages: Map<string, Slot>
  /** ハードな指示を含むか（解が無ければソフトに落として解き直す） */
  hasHardDirectives: boolean
}

export function buildModel(problem: Problem, options: ModelOptions = {}): AssistModel {
  const weights = options.weights ?? WEIGHTS
  const directives = options.directives ?? []
  const builder = new LpBuilder()
  const cells = new Map<string, ModelCell>()
  const shortages = new Map<string, Slot>()

  const staffIndex = new Map(problem.staffs.map((staff, index) => [staff.id, index]))
  const patternIndex = new Map(problem.patterns.map((pattern, index) => [pattern.id, index]))
  const dateIndex = new Map(problem.dates.map((date, index) => [date, index]))
  const scope = [...problem.dates, problem.landingDate]

  // ---- 変数 ----------------------------------------------------------------
  /** `staffId|date` → その日に直接置ける変数 */
  const direct = new Map<string, { name: string; patternId: string }[]>()
  /** `staffId|date` → 前日の親から着地する変数（ペア） */
  const landing = new Map<string, { name: string; patternId: string }[]>()
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  const key = (staffId: string, date: string) => `${staffId}|${date}`

  for (const slot of problem.demand) {
    for (const staff of problem.staffs) {
      if (staticBlock(problem, staff, slot.date, slot.patternId)) continue
      const name = `x${staffIndex.get(staff.id)}_${dateIndex.get(slot.date)}_${patternIndex.get(slot.patternId)}`
      builder.binary(name)
      cells.set(name, { staffId: staff.id, date: slot.date, patternId: slot.patternId })
      push(direct, key(staff.id, slot.date), { name, patternId: slot.patternId })
      const pairId = problem.patternById.get(slot.patternId)?.pairPatternId
      if (pairId) push(landing, key(staff.id, addDays(slot.date, 1)), { name, patternId: pairId })
    }
  }
  const staffsWithVars = new Set([...cells.values()].map((cell) => cell.staffId))

  // ---- 式 ------------------------------------------------------------------
  const existingPattern = (staffId: string, date: string) =>
    problem.existing.get(cellKey(staffId, date))

  /** 新しく入る分（変数だけ）で、そのパターンなら 1 */
  const isNew = (staffId: string, date: string, patternId: string) => {
    const expr = new Linear()
    for (const v of direct.get(key(staffId, date)) ?? [])
      if (v.patternId === patternId) expr.add(v.name)
    for (const v of landing.get(key(staffId, date)) ?? [])
      if (v.patternId === patternId) expr.add(v.name)
    return expr
  }
  const is = (staffId: string, date: string, patternId: string) =>
    isNew(staffId, date, patternId).addConstant(
      existingPattern(staffId, date) === patternId ? 1 : 0
    )

  const workNew = (staffId: string, date: string) => {
    const expr = new Linear()
    for (const v of direct.get(key(staffId, date)) ?? []) expr.add(v.name)
    for (const v of landing.get(key(staffId, date)) ?? []) {
      if (isWorkday(problem, v.patternId)) expr.add(v.name)
    }
    return expr
  }
  const work = (staffId: string, date: string) =>
    workNew(staffId, date).addConstant(isWorkday(problem, existingPattern(staffId, date)) ? 1 : 0)

  // ---- H1 / H2: 1 日 1 枠（新規どうし・ペアの翌日） -------------------------
  for (const staffId of staffsWithVars) {
    for (const date of scope) {
      const expr = new Linear()
      for (const v of direct.get(key(staffId, date)) ?? []) expr.add(v.name)
      for (const v of landing.get(key(staffId, date)) ?? []) expr.add(v.name)
      if (expr.size >= 2) builder.constrain(expr, '<=', 1)
    }
  }

  // ---- H10: 必要人数を超えない + 不足変数 -----------------------------------
  const shortageByKey = new Map<string, string>()
  for (const date of scope) {
    for (const pattern of problem.patterns) {
      if (pattern.kind !== 'workday') continue
      const expr = new Linear()
      for (const staffId of staffsWithVars) expr.plus(isNew(staffId, date, pattern.id))
      const cap = capacityAt(problem, date, pattern.id)
      if (date !== problem.landingDate && cap > 0) {
        const name = `u${dateIndex.get(date)}_${patternIndex.get(pattern.id)}`
        shortages.set(name, { date, patternId: pattern.id, count: cap })
        shortageByKey.set(slotKey(date, pattern.id), name)
        builder.objective.add(name, weights.shortage)
        builder.constrain(expr.add(name), '=', cap)
      } else if (expr.size > 0) {
        builder.constrain(expr, '<=', cap)
      }
    }
  }

  // ---- H5: 週の勤務日数 -----------------------------------------------------
  const weeks = new Map<string, string[]>()
  for (const date of scope) {
    const week = weekDates(date, problem.startOfWeek)
    weeks.set(week[0], week)
  }
  for (const staff of problem.staffs) {
    if (!staffsWithVars.has(staff.id)) continue
    for (const week of weeks.values()) {
      const expr = new Linear()
      for (const date of week) expr.plus(work(staff.id, date))
      builder.constrain(expr, '<=', staff.maxWorkWeek, { clamp: true })
    }
  }

  // ---- H6〜H9: 制約（restrictions） -----------------------------------------
  const pairStart = addDays(problem.period.start, -1)
  for (const restriction of problem.restrictions) {
    if (!restriction.hard) continue
    for (const staffId of staffsWithVars) {
      switch (restriction.kind) {
        case 'deny_pattern_pair':
          for (const date of datesBetween(pairStart, problem.landingDate)) {
            const expr = is(staffId, date, restriction.pattern1Id).plus(
              is(staffId, addDays(date, 1), restriction.pattern2Id)
            )
            builder.constrain(expr, '<=', 1, { clamp: true })
          }
          break
        case 'max_work_week':
          for (const week of weeks.values()) {
            const expr = new Linear()
            for (const date of week) expr.plus(is(staffId, date, restriction.patternId))
            builder.constrain(expr, '<=', restriction.days, { clamp: true })
          }
          break
        case 'max_work_consecutive': {
          const n = restriction.days
          const matches = (date: string) =>
            restriction.patternId === null
              ? work(staffId, date)
              : is(staffId, date, restriction.patternId)
          // 長さ n+1 の全ての窓。変数を含む窓だけが残る（constrain が変数の無い式を捨てる）
          for (const start of datesBetween(
            addDays(problem.period.start, -n),
            problem.landingDate
          )) {
            const expr = new Linear()
            for (let offset = 0; offset <= n; offset++) expr.plus(matches(addDays(start, offset)))
            builder.constrain(expr, '<=', n, { clamp: true })
          }
          break
        }
        case 'sat_or_sun_dayoff':
          for (const date of datesBetween(pairStart, problem.landingDate)) {
            if (wday(date) !== 6) continue
            const expr = work(staffId, date).plus(work(staffId, addDays(date, 1)))
            builder.constrain(expr, '<=', 1, { clamp: true })
          }
          break
      }
    }
  }

  // ---- ソフト: 公平性（§5.4。中心は事前に計算した定数） ---------------------
  addBalanceTerms(problem, builder, weights, staffsWithVars, { work, is, isNew })

  // ---- ソフト: デフォルト勤務パターン / 前の案との一致 ------------------------
  const previous = new Set(
    (options.previousPlan ?? [])
      .filter((row) => row.source === 'assign')
      .map((row) => `${row.staffId}|${row.date}|${row.patternId}`)
  )
  for (const [name, cell] of cells) {
    const staff = problem.staffById.get(cell.staffId)!
    const dayKey = dayKeyFor(cell.date, problem.holidays.has(cell.date))
    if (staff.defaults[dayKey] === cell.patternId)
      builder.objective.add(name, -weights.defaultPattern)
    if (previous.has(`${cell.staffId}|${cell.date}|${cell.patternId}`)) {
      builder.objective.add(name, weights.previousPlan)
    }
  }

  // ---- 店長の指示 -----------------------------------------------------------
  let softIndex = 0
  const ctx: DirectiveModelContext = {
    problem,
    weights,
    work,
    is,
    newLinear: () => new Linear(),
    shortage: (date, patternId) => shortageByKey.get(slotKey(date, patternId)),
    hard: (expr, op, rhs, clamp) => builder.constrain(expr, op, rhs, { clamp }),
    soft: (expr, op, rhs, weight) => {
      if (expr.size === 0) return
      const name = `v${softIndex++}`
      builder.objective.add(name, weight)
      // <= なら expr − v ≤ rhs、>= なら expr + v ≥ rhs
      builder.constrain(expr.add(name, op === '<=' ? -1 : 1), op, rhs)
    },
    objective: (expr, factor) => {
      for (const [name, coef] of expr.terms) builder.objective.add(name, coef * factor)
    },
  }
  for (const directive of directives) addDirective(ctx, directive, options.relaxDirectives ?? false)

  return {
    builder,
    cells,
    shortages,
    hasHardDirectives: directives.some((directive) => directive.hard),
  }
}

type Exprs = {
  work: (staffId: string, date: string) => Linear
  is: (staffId: string, date: string, patternId: string) => Linear
  isNew: (staffId: string, date: string, patternId: string) => Linear
}

/**
 * 偏りの 3 項（勤務日数 / 土日祝 / パターン）。いずれも L1 偏差で、中心は自由変数にせず定数にする
 * （§3.2 の計測: 自由変数だと 30 人で 10 秒を超える）。
 *
 * - 勤務日数: `T_s / max_work_week_s` を中心 `c = (既存の勤務日数 + 不足枠) / Σ max_work_week` にそろえる（既存込みで月全体を均す）
 * - 土日祝 / パターン: 担当できる人のあいだで、`max_work_week` に比例した取り分を中心にする
 */
function addBalanceTerms(
  problem: Problem,
  builder: LpBuilder,
  weights: Weights,
  staffsWithVars: Set<string>,
  { work, is, isNew }: Exprs
): void {
  const staffs = problem.staffs.filter(
    (staff) => staff.maxWorkWeek > 0 && staffsWithVars.has(staff.id)
  )
  if (staffs.length === 0) return

  const deviation = (name: string, expr: Linear, center: number, scale: number, weight: number) => {
    // |expr − center| ≤ scale · dev
    builder.objective.add(name, weight)
    builder.constrain(new Linear().plus(expr).add(name, -scale), '<=', center)
    builder.constrain(new Linear().plus(expr).add(name, scale), '>=', center)
  }

  // 勤務日数
  const workTotals = new Map(
    staffs.map((staff) => {
      const expr = new Linear()
      for (const date of problem.dates) expr.plus(work(staff.id, date))
      return [staff.id, expr]
    })
  )
  const existingWork = staffs.reduce((sum, staff) => sum + workTotals.get(staff.id)!.constant, 0)
  const capSum = staffs.reduce((sum, staff) => sum + staff.maxWorkWeek, 0)
  const center = (existingWork + problem.requested) / capSum
  staffs.forEach((staff, index) => {
    deviation(
      `dw${index}`,
      workTotals.get(staff.id)!,
      center * staff.maxWorkWeek,
      staff.maxWorkWeek,
      weights.workdayBalance
    )
  })

  // 土日祝
  const weekendDates = problem.dates.filter((date) => isWeekendOrHoliday(problem, date))
  const weekendStaffs = staffs.filter((staff) =>
    weekendDates.some((date) => problem.patterns.some((p) => isNew(staff.id, date, p.id).size > 0))
  )
  if (weekendStaffs.length > 1) {
    const totals = new Map(
      weekendStaffs.map((staff) => {
        const expr = new Linear()
        for (const date of weekendDates) expr.plus(work(staff.id, date))
        return [staff.id, expr]
      })
    )
    const demand = problem.demand
      .filter((slot) => weekendDates.includes(slot.date))
      .reduce((sum, slot) => sum + slot.count, 0)
    const existing = weekendStaffs.reduce((sum, staff) => sum + totals.get(staff.id)!.constant, 0)
    const caps = weekendStaffs.reduce((sum, staff) => sum + staff.maxWorkWeek, 0)
    weekendStaffs.forEach((staff, index) => {
      const share = ((existing + demand) * staff.maxWorkWeek) / caps
      deviation(`dh${index}`, totals.get(staff.id)!, share, 1, weights.weekendBalance)
    })
  }

  // パターン
  problem.patterns.forEach((pattern, patternIndex) => {
    const demand = problem.demand
      .filter((slot) => slot.patternId === pattern.id)
      .reduce((sum, slot) => sum + slot.count, 0)
    if (demand === 0) return
    const eligible = staffs.filter((staff) =>
      problem.dates.some((date) => isNew(staff.id, date, pattern.id).size > 0)
    )
    if (eligible.length < 2) return
    const totals = new Map(
      eligible.map((staff) => {
        const expr = new Linear()
        for (const date of problem.dates) expr.plus(is(staff.id, date, pattern.id))
        return [staff.id, expr]
      })
    )
    const existing = eligible.reduce((sum, staff) => sum + totals.get(staff.id)!.constant, 0)
    const caps = eligible.reduce((sum, staff) => sum + staff.maxWorkWeek, 0)
    eligible.forEach((staff, index) => {
      const share = ((existing + demand) * staff.maxWorkWeek) / caps
      deviation(
        `dp${patternIndex}_${index}`,
        totals.get(staff.id)!,
        share,
        1,
        weights.patternBalance
      )
    })
  })
}

/** 1 段目の目的関数（不足の合計だけ）と、2 段目に足す「不足の合計 ≤ 1 段目の値」の行 */
export function shortageObjective(model: AssistModel): Linear {
  const expr = new Linear()
  for (const name of model.shortages.keys()) expr.add(name)
  return expr
}

export function shortageCap(model: AssistModel, total: number) {
  // 1 段目の値は整数のはず（0/1 変数の和との差）。浮動小数の誤差を丸めてから少し緩める
  return row(shortageObjective(model), '<=', Math.round(total) + 1e-6)
}

/** 解（変数名 → 値）から計画を組む。ペアの行も足す */
export function planFromValues(
  problem: Problem,
  model: AssistModel,
  values: Map<string, number>
): PlanRow[] {
  const plan: PlanRow[] = []
  for (const [name, cell] of model.cells) {
    if ((values.get(name) ?? 0) > 0.5) plan.push(...withPair(problem, cell))
  }
  return plan
}
