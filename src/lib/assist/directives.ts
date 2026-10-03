import { z } from 'zod'
import { formatMonthDay, isDateString, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import type { Linear } from './lp'
import { allWeeks, fullWeeks, isWeekendOrHoliday, type Problem } from './problem'
import type { PlanState } from './validate'
import { RELAXED_STRENGTH, type Weights } from './weights'

/**
 * 店長の指示（012 §5.5）。LLM が自然言語から「重み付きの条件」を書き、ここで型を確かめてから MILP に渡す。
 *
 * LLM に書かせるのは小さくて型のある成果物だけ（§2.3 の研究の結論）。スタッフ・パターンはコード（`S3` / `P1`）で受け、
 * **日付や曜日の特定も TS 側で P の中に絞る**（LLM に日付計算を任せない）。
 */

export const DIRECTIVE_TYPES = [
  'prefer_pattern',
  'avoid_pattern',
  'prefer_work',
  'prefer_off',
  'limit_workdays',
  'min_workdays',
  'limit_weekends',
  'same_days',
  'different_days',
  'fill_first',
] as const

export type DirectiveType = (typeof DIRECTIVE_TYPES)[number]

/**
 * LLM の出力（構造化出力の JSON Schema の元）。
 *
 * 型ごとに使う列が違うが、**判別共用体にせず 1 つの平らな object** にする: strict モードは全列を required にするので
 * 使わない列は null で返させ、型ごとの必須列は `resolveDirectives()` が確かめる。数値の範囲もここでは付けない
 * （範囲外の値 1 つで応答全体の parse が落ちるより、その指示だけ「条件にできませんでした」にするほうがよい）。
 */
export const rawDirectiveSchema = z.object({
  type: z.enum(DIRECTIVE_TYPES),
  staff: z.string().nullable(),
  staffB: z.string().nullable(),
  pattern: z.string().nullable(),
  wdays: z.array(z.number()).nullable(),
  dates: z.array(z.string()).nullable(),
  count: z.number().nullable(),
  scope: z.enum(['week', 'period']).nullable(),
  strength: z.number(),
  hard: z.boolean(),
})

export type RawDirective = z.infer<typeof rawDirectiveSchema>

export const interpretOutputSchema = z.object({
  directives: z.array(rawDirectiveSchema),
  interpretations: z.array(
    z.object({
      /** 店長の指示のうち、この解釈が指す部分（原文から抜き出す） */
      text: z.string(),
      /** `directives` の添字。条件にできなかったものは null */
      directive: z.number().nullable(),
      /** 条件にできなかった理由など（任意） */
      note: z.string().nullable(),
    })
  ),
})

export type InterpretOutput = z.infer<typeof interpretOutputSchema>

type Base = {
  strength: number
  hard: boolean
  /** 表示用の「土日」「10/3・10/4」など */ daysLabel: string
}

/** 解決済みの指示（コード → id、日付 → P の中）。MILP と評価と表示が使う */
export type Directive = Base &
  (
    | {
        type: 'prefer_pattern' | 'avoid_pattern'
        staffId: string
        patternId: string
        dates: string[]
      }
    | { type: 'prefer_work' | 'prefer_off'; staffId: string; dates: string[] }
    | {
        type: 'limit_workdays' | 'min_workdays'
        staffId: string
        count: number
        scope: 'week' | 'period'
      }
    | { type: 'limit_weekends'; staffId: string; count: number }
    | { type: 'same_days' | 'different_days'; staffId: string; staffBId: string }
    | { type: 'fill_first'; dates: string[]; patternId: string | null }
  )

/** 画面に出す「解釈」の 1 行。条件にできなかったものは `directive` が null */
export type Interpretation = { text: string; directive: number | null; note: string | null }

function clampStrength(value: number): number {
  if (!Number.isFinite(value)) return 3
  return Math.min(5, Math.max(1, Math.round(value)))
}

function wdaysLabel(wdays: number[]): string {
  const sorted = [...new Set(wdays)].sort((a, b) => a - b)
  if (sorted.length === 2 && sorted[0] === 0 && sorted[1] === 6) return '土日'
  return sorted.map((day) => WEEKDAY_LABELS[day]).join('・') + '曜'
}

/**
 * 対象日（P の中）。曜日と日付のどちらかに当たる日。どちらも無ければ期間の全日。
 * 期間外の日付・実在しない日付は捨てる。
 */
function targetDates(
  problem: Problem,
  raw: Pick<RawDirective, 'wdays' | 'dates'>
): { dates: string[]; label: string; specified: boolean } {
  const wdays = (raw.wdays ?? []).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
  const picked = new Set(
    (raw.dates ?? []).filter(
      (date) => isDateString(date) && date >= problem.period.start && date <= problem.period.end
    )
  )
  const specified = wdays.length > 0 || (raw.dates ?? []).length > 0
  if (!specified) return { dates: problem.dates, label: '', specified }

  const wdaySet = new Set(wdays)
  const dates = problem.dates.filter((date) => wdaySet.has(wday(date)) || picked.has(date))
  const labels = [
    ...(wdays.length > 0 ? [wdaysLabel(wdays)] : []),
    ...[...picked].sort().map(formatMonthDay),
  ]
  return { dates, label: labels.join('・'), specified }
}

type Resolved = { directive: Directive } | { error: string }

function resolveOne(problem: Problem, raw: RawDirective): Resolved {
  const byCode = (code: string | null) =>
    code === null ? undefined : problem.staffs.find((staff) => staff.code === code)
  const patternByCode = (code: string | null) =>
    code === null ? undefined : problem.patterns.find((pattern) => pattern.code === code)
  const strength = clampStrength(raw.strength)

  if (raw.type === 'fill_first') {
    const pattern = raw.pattern === null ? null : patternByCode(raw.pattern)
    if (pattern === undefined) return { error: '勤務パターンが分かりませんでした' }
    if (pattern && pattern.kind !== 'workday') return { error: '休みのパターンは枠になりません' }
    const target = targetDates(problem, raw)
    if (target.dates.length === 0) return { error: '期間内に当たる日がありません' }
    return {
      directive: {
        type: 'fill_first',
        dates: target.dates,
        patternId: pattern?.id ?? null,
        strength,
        hard: false,
        daysLabel: target.label,
      },
    }
  }

  const staff = byCode(raw.staff)
  if (!staff) return { error: 'スタッフが分かりませんでした' }

  switch (raw.type) {
    case 'prefer_pattern':
    case 'avoid_pattern': {
      const pattern = patternByCode(raw.pattern)
      if (!pattern) return { error: '勤務パターンが分かりませんでした' }
      if (pattern.kind !== 'workday') return { error: '休みのパターンは指定できません' }
      const target = targetDates(problem, raw)
      if (target.dates.length === 0) return { error: '期間内に当たる日がありません' }
      // 「必ず早番」を日の指定なしで守らせると期間の全日が早番になる。日が無いものはソフトに落とす
      const hard = raw.hard && (raw.type === 'avoid_pattern' || target.specified)
      return {
        directive: {
          type: raw.type,
          staffId: staff.id,
          patternId: pattern.id,
          dates: target.dates,
          strength: raw.hard && !hard ? RELAXED_STRENGTH : strength,
          hard,
          daysLabel: target.label,
        },
      }
    }
    case 'prefer_work':
    case 'prefer_off': {
      const target = targetDates(problem, raw)
      if (target.dates.length === 0) return { error: '期間内に当たる日がありません' }
      const hard = raw.hard && (raw.type === 'prefer_off' || target.specified)
      return {
        directive: {
          type: raw.type,
          staffId: staff.id,
          dates: target.dates,
          strength: raw.hard && !hard ? RELAXED_STRENGTH : strength,
          hard,
          daysLabel: target.label,
        },
      }
    }
    case 'limit_workdays':
    case 'min_workdays':
    case 'limit_weekends': {
      const count = raw.count
      if (count === null || !Number.isInteger(count) || count < 0 || count > 31) {
        return { error: '日数が分かりませんでした' }
      }
      if (raw.type === 'limit_weekends') {
        return {
          directive: {
            type: raw.type,
            staffId: staff.id,
            count,
            strength,
            hard: raw.hard,
            daysLabel: '',
          },
        }
      }
      const scope = raw.scope ?? 'period'
      if (scope === 'week' && count > 7) return { error: '日数が分かりませんでした' }
      return {
        directive: {
          type: raw.type,
          staffId: staff.id,
          count,
          scope,
          strength,
          hard: raw.hard,
          daysLabel: '',
        },
      }
    }
    case 'same_days':
    case 'different_days': {
      const other = byCode(raw.staffB)
      if (!other) return { error: 'スタッフが分かりませんでした' }
      if (other.id === staff.id) return { error: '同じスタッフどうしは指定できません' }
      return {
        directive: {
          type: raw.type,
          staffId: staff.id,
          staffBId: other.id,
          strength,
          hard: raw.hard,
          daysLabel: '',
        },
      }
    }
  }
}

/**
 * LLM の出力を解決する（012 §5.5）。未知のコード・在籍でないスタッフ・休みのパターン・期間外の日だけの指示は捨て、
 * 解釈の一覧に「条件にできませんでした」を残す。解釈の `directive` は解決後の添字に付け替える。
 */
export function resolveDirectives(
  problem: Problem,
  output: InterpretOutput
): { directives: Directive[]; interpretations: Interpretation[] } {
  const directives: Directive[] = []
  const indexMap = new Map<number, number>()
  const errors = new Map<number, string>()

  output.directives.forEach((raw, index) => {
    const resolved = resolveOne(problem, raw)
    if ('error' in resolved) {
      errors.set(index, resolved.error)
      return
    }
    indexMap.set(index, directives.length)
    directives.push(resolved.directive)
  })

  const referenced = new Set<number>()
  const interpretations: Interpretation[] = output.interpretations.map((item) => {
    const raw = item.directive
    if (raw === null || !Number.isInteger(raw)) return { ...item, directive: null }
    const mapped = indexMap.get(raw)
    if (mapped === undefined) {
      return { text: item.text, directive: null, note: errors.get(raw) ?? item.note }
    }
    referenced.add(mapped)
    return { ...item, directive: mapped }
  })

  // 解釈の一覧から漏れた条件も画面に出す（守れたかどうかを店長が確かめられるように）
  directives.forEach((_, index) => {
    if (!referenced.has(index)) interpretations.push({ text: '', directive: index, note: null })
  })

  return { directives, interpretations }
}

/** 一覧に出す 1 行（例: 「田中 → 土日の勤務を優先（できれば）」）。名前は TS が引く（LLM に書かせない） */
export function describeDirective(problem: Problem, directive: Directive): string {
  const staffName = (id: string) => problem.staffById.get(id)?.name ?? '?'
  const patternName = (id: string | null) =>
    id === null ? '' : (problem.patternById.get(id)?.name ?? '?')
  const days = directive.daysLabel ? `${directive.daysLabel}` : ''
  const on = days ? `${days}は` : ''
  const mode = directive.hard ? '（必ず）' : '（できれば）'

  switch (directive.type) {
    case 'prefer_pattern':
      return `${staffName(directive.staffId)} → ${on}${patternName(directive.patternId)}を優先${mode}`
    case 'avoid_pattern':
      return `${staffName(directive.staffId)} → ${on}${patternName(directive.patternId)}を避ける${mode}`
    case 'prefer_work':
      return `${staffName(directive.staffId)} → ${days ? `${days}の` : ''}勤務を優先${mode}`
    case 'prefer_off':
      return `${staffName(directive.staffId)} → ${days ? `${days}は` : ''}休み${mode}`
    case 'limit_workdays':
      return `${staffName(directive.staffId)} → ${directive.scope === 'week' ? '週' : '期間中'} ${directive.count}日まで${mode}`
    case 'min_workdays':
      return `${staffName(directive.staffId)} → ${directive.scope === 'week' ? '週' : '期間中'} ${directive.count}日以上${mode}`
    case 'limit_weekends':
      return `${staffName(directive.staffId)} → 土日祝は ${directive.count}日まで${mode}`
    case 'same_days':
      return `${staffName(directive.staffId)} → ${staffName(directive.staffBId)}と同じ日に${mode}`
    case 'different_days':
      return `${staffName(directive.staffId)} → ${staffName(directive.staffBId)}と別の日に${mode}`
    case 'fill_first':
      return `${days ? `${days}の` : ''}${patternName(directive.patternId) || '枠'}を優先して埋める`
  }
}

// ---------------------------------------------------------------------------
// MILP への変換
// ---------------------------------------------------------------------------

/** model.ts が渡す、式を組むための口 */
export type DirectiveModelContext = {
  problem: Problem
  weights: Weights
  /** 勤務（出勤日パターン）なら 1 になる式（既存は定数） */
  work: (staffId: string, date: string) => Linear
  /** そのパターンなら 1 になる式（ペアで入る行を含む） */
  is: (staffId: string, date: string, patternId: string) => Linear
  newLinear: () => Linear
  /** 不足変数（無ければ undefined） */
  shortage: (date: string, patternId: string) => string | undefined
  /** ハードな制約として書く（`clamp` は既存だけで超えている上限を 0 に止める） */
  hard: (expr: Linear, op: '<=' | '>=' | '=', rhs: number, clamp?: boolean) => void
  /** ソフトな違反量の変数を作り、`expr op rhs` を「違反 v を許して」書く。v の費用は weight */
  soft: (expr: Linear, op: '<=' | '>=', rhs: number, weight: number) => void
  /** 目的関数に項を足す（負ならボーナス） */
  objective: (expr: Linear, factor: number) => void
}

function sum(ctx: DirectiveModelContext, parts: Linear[]): Linear {
  const total = ctx.newLinear()
  for (const part of parts) total.plus(part)
  return total
}

/**
 * 1 つの指示を MILP に足す（012 §5.4 / §5.5）。ソフトなら違反量 × 20 × 強さ、ハードなら制約。
 * `relaxed` はハードな指示で解が無くなったときの 2 回目（すべてソフト、強さ 5。§3.9）。
 */
export function addDirective(
  ctx: DirectiveModelContext,
  directive: Directive,
  relaxed: boolean
): void {
  const { problem } = ctx
  const hard = directive.hard && !relaxed
  const strength = directive.hard && relaxed ? RELAXED_STRENGTH : directive.strength
  const weight = ctx.weights.directivePerStrength * strength

  switch (directive.type) {
    case 'prefer_pattern':
      for (const date of directive.dates) {
        const expr = ctx.is(directive.staffId, date, directive.patternId)
        if (hard) ctx.hard(expr, '>=', 1)
        else ctx.objective(expr, -weight)
      }
      return
    case 'avoid_pattern':
      for (const date of directive.dates) {
        const expr = ctx.is(directive.staffId, date, directive.patternId)
        if (hard) ctx.hard(expr, '<=', 0, true)
        else ctx.objective(expr, weight)
      }
      return
    case 'prefer_work':
      for (const date of directive.dates) {
        const expr = ctx.work(directive.staffId, date)
        if (hard) ctx.hard(expr, '>=', 1)
        else ctx.objective(expr, -weight)
      }
      return
    case 'prefer_off':
      for (const date of directive.dates) {
        const expr = ctx.work(directive.staffId, date)
        if (hard) ctx.hard(expr, '<=', 0, true)
        else ctx.objective(expr, weight)
      }
      return
    case 'limit_workdays':
    case 'min_workdays': {
      const groups = directiveWeeks(problem, directive.scope, directive.type === 'min_workdays')
      for (const dates of groups) {
        const expr = sum(
          ctx,
          dates.map((date) => ctx.work(directive.staffId, date))
        )
        const op = directive.type === 'limit_workdays' ? '<=' : '>='
        if (hard) ctx.hard(expr, op, directive.count, op === '<=')
        else ctx.soft(expr, op, directive.count, weight)
      }
      return
    }
    case 'limit_weekends': {
      const dates = problem.dates.filter((date) => isWeekendOrHoliday(problem, date))
      const expr = sum(
        ctx,
        dates.map((date) => ctx.work(directive.staffId, date))
      )
      if (hard) ctx.hard(expr, '<=', directive.count, true)
      else ctx.soft(expr, '<=', directive.count, weight)
      return
    }
    case 'same_days':
      // 「A が勤務する日は B も勤務」（A ⊆ B。新人を先輩と同じ日に、の形）
      for (const date of problem.dates) {
        const expr = ctx.work(directive.staffId, date).plus(ctx.work(directive.staffBId, date), -1)
        if (hard) ctx.hard(expr, '<=', 0)
        else ctx.soft(expr, '<=', 0, weight)
      }
      return
    case 'different_days':
      for (const date of problem.dates) {
        const expr = ctx.work(directive.staffId, date).plus(ctx.work(directive.staffBId, date))
        if (hard) ctx.hard(expr, '<=', 1, true)
        else ctx.soft(expr, '<=', 1, weight)
      }
      return
    case 'fill_first':
      // 不足の重みに上乗せする。不足の合計は 1 段目で決まるので、どの枠を残すかの優先度として効く
      for (const date of directive.dates) {
        for (const pattern of problem.patterns) {
          if (directive.patternId !== null && pattern.id !== directive.patternId) continue
          const name = ctx.shortage(date, pattern.id)
          if (name) ctx.objective(ctx.newLinear().add(name), weight)
        }
      }
      return
  }
}

/**
 * `scope` ごとの日付のまとまり。期間なら P 全体、週なら P にかかる週（既存を含む 7 日）。
 * 下限（min）は P に丸ごと入る週だけにする（P の外の日は動かせないので、端の週で下限を課すと守れない）。
 */
function directiveWeeks(problem: Problem, scope: 'week' | 'period', minimum: boolean): string[][] {
  if (scope === 'period') return [problem.dates]
  // 下限は制約の `min_work_week` と同じ週で数える（013 §5.4。指示から規則へ保存しても意味が変わらない）
  if (minimum) return fullWeeks(problem)
  return allWeeks(problem, problem.dates)
}

// ---------------------------------------------------------------------------
// 評価（守れたかどうか）
// ---------------------------------------------------------------------------

export type DirectiveOutcome = { kept: boolean; detail: string }

/**
 * 保存する計画に対して、指示を守れたかを数える（012 §3.9「解いた結果の違反量で分かる」）。既存のシフトも含めて数える。
 * 「優先」系は 1 日でも当たれば守れたとし、何日中何日かを添える。
 */
export function evaluateDirective(
  problem: Problem,
  state: PlanState,
  directive: Directive,
  unfilledAt: (date: string, patternId: string) => number
): DirectiveOutcome {
  const works = (staffId: string, date: string) => {
    const patternId = state.occupant(staffId, date)
    return patternId !== undefined && problem.patternById.get(patternId)?.kind === 'workday'
  }
  const hits = (dates: string[], matches: (date: string) => boolean) => dates.filter(matches).length

  switch (directive.type) {
    case 'prefer_pattern':
    case 'prefer_work': {
      const matches =
        directive.type === 'prefer_pattern'
          ? (date: string) => state.occupant(directive.staffId, date) === directive.patternId
          : (date: string) => works(directive.staffId, date)
      const count = hits(directive.dates, matches)
      const kept = directive.hard ? count === directive.dates.length : count > 0
      return { kept, detail: `${directive.dates.length}日中 ${count}日` }
    }
    case 'avoid_pattern':
    case 'prefer_off': {
      const matches =
        directive.type === 'avoid_pattern'
          ? (date: string) => state.occupant(directive.staffId, date) === directive.patternId
          : (date: string) => works(directive.staffId, date)
      const count = hits(directive.dates, matches)
      return { kept: count === 0, detail: count === 0 ? '' : `${count}日入っています` }
    }
    case 'limit_workdays':
    case 'min_workdays': {
      const groups = directiveWeeks(problem, directive.scope, directive.type === 'min_workdays')
      const counts = groups.map((dates) => hits(dates, (date) => works(directive.staffId, date)))
      const over =
        directive.type === 'limit_workdays'
          ? counts.filter((count) => count > directive.count)
          : counts.filter((count) => count < directive.count)
      const extreme =
        counts.length === 0
          ? 0
          : directive.type === 'limit_workdays'
            ? Math.max(...counts)
            : Math.min(...counts)
      const unit = directive.scope === 'week' ? '週' : '期間中'
      return {
        kept: over.length === 0,
        detail: `${unit}${directive.type === 'limit_workdays' ? '最大' : '最少'} ${extreme}日`,
      }
    }
    case 'limit_weekends': {
      const dates = problem.dates.filter((date) => isWeekendOrHoliday(problem, date))
      const count = hits(dates, (date) => works(directive.staffId, date))
      return { kept: count <= directive.count, detail: `${count}日` }
    }
    case 'same_days': {
      const count = hits(
        problem.dates,
        (date) => works(directive.staffId, date) && !works(directive.staffBId, date)
      )
      return { kept: count === 0, detail: count === 0 ? '' : `${count}日は別々です` }
    }
    case 'different_days': {
      const count = hits(
        problem.dates,
        (date) => works(directive.staffId, date) && works(directive.staffBId, date)
      )
      return { kept: count === 0, detail: count === 0 ? '' : `${count}日は同じ日です` }
    }
    case 'fill_first': {
      let left = 0
      for (const date of directive.dates) {
        for (const pattern of problem.patterns) {
          if (directive.patternId !== null && pattern.id !== directive.patternId) continue
          left += unfilledAt(date, pattern.id)
        }
      }
      return { kept: left === 0, detail: left === 0 ? '' : `${left}枠が残りました` }
    }
  }
}
