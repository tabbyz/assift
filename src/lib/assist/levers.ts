import { tightenRestrictionDays } from '@/lib/restrictions/describe'
import { describeDirective, type Directive } from './directives'
import { planAssignments } from './engine'
import {
  buildProblem,
  slotKey,
  type AssistInput,
  type PlanRow,
  type Problem,
  type Restriction,
} from './problem'
import { filledCount, unfilledCounts, type UnfilledSlot } from './reasons'
import { restrictionLabel, validatePlan } from './validate'

/**
 * 効く一手（012 §11.2）。条件を 1 つだけ緩めて解き直し、**何枠増えるか**を数える。
 *
 * 試算は増分: 保存した計画を既存シフトとして問題を組み直し、残りの枠だけを解く。全体を解き直すと
 * ほかのセルの入れ替わりまで起きて、「+N 枠」と点線が実行後の表と合わなくなる。
 * 「この指示を外して作り直す」「条件を緩めて作り直す」（`applyAssistLever`）は同じ問題を解くので、
 * 表が変わっていなければ同じ行が入る。制約の一手は店舗の設定を変えず、この実行の問題だけを緩める。
 */

export type LeverCandidate =
  | { kind: 'directive'; directiveIndex: number }
  | { kind: 'restriction'; restrictionIndex: number; action: 'remove' | 'relax' }

export type Lever = {
  kind: 'directive' | 'restriction'
  /** 画面の見出し（「青木 隆行 → 期間中 0日まで（必ず）」「「早番は1週間に2日まで」」） */
  label: string
  action: 'remove' | 'relax'
  /** 日数を 1 増やした値（`relax` のとき） */
  relaxedTo: number | null
  /** `request.directives` の添字（指示の一手のとき） */
  directiveIndex: number | null
  /** 問題の `restrictions` の添字（制約の一手のとき。適用時にラベルでも引き直す） */
  restrictionIndex: number | null
  /** 制約の id（013 から。規則の編集画面へのリンクと、適用時の引き直しに使う） */
  restrictionId: string | null
  /** 増える枠の数 */
  gain: number
  /** 増える枠のパターンごとの内訳（パターンの表示順） */
  byPattern: { patternId: string; count: number }[]
  /** 入る行（ペアを含む）。表の点線 */
  rows: PlanRow[]
}

/** 候補の上限。試算 1 件は残りの枠だけを解くので軽いが、実行の待ち時間に足されるので絞る */
const MAX_DIRECTIVE_CANDIDATES = 3
const MAX_CANDIDATES = 5
/** 画面に出す件数（「上位 2 件で打ち切る」） */
export const MAX_LEVERS = 2
/**
 * 試算 1 件の 1 段あたりの上限（秒）。**一手の実行（`runAssist` の `keep`）も同じ値で解く**:
 * 上限に届いたときの解は上限で変わるので、揃えないと点線と実行後の表がずれうる
 */
export const WHAT_IF_TIME_LIMIT = 2

/**
 * 試す条件を選ぶ。純関数。
 *
 * - ハードな指示（「必ず」）。緩めて解き直した実行では、ソフトになった指示は不足の数に効かない
 *   （1 段目は不足だけを最小化する）ので候補にしない
 * - 制約は、理由の集計（breakdown）に名前が出たものだけ。出た回数の多い順
 */
export function leverCandidates(
  problem: Problem,
  directives: Directive[],
  disabled: ReadonlySet<number>,
  relaxed: boolean,
  unfilled: Pick<UnfilledSlot, 'breakdown'>[]
): LeverCandidate[] {
  const directiveCandidates: LeverCandidate[] = relaxed
    ? []
    : directives
        .map((directive, index) => ({ directive, index }))
        .filter(({ directive, index }) => directive.hard && !disabled.has(index))
        .slice(0, MAX_DIRECTIVE_CANDIDATES)
        .map(({ index }) => ({ kind: 'directive', directiveIndex: index }))

  const mentions = new Map<string, number>()
  for (const slot of unfilled) {
    for (const item of slot.breakdown) {
      mentions.set(item.label, (mentions.get(item.label) ?? 0) + item.count)
    }
  }
  const restrictionCandidates = problem.restrictions
    .map((restriction, index) => ({
      restriction,
      index,
      // validate.ts の `rule` と同じ形（「」で囲む）
      count: mentions.get(`「${restrictionLabel(problem, restriction)}」`) ?? 0,
    }))
    .filter((item) => item.restriction.hard && item.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .map(({ restriction, index }): LeverCandidate => ({
      kind: 'restriction',
      restrictionIndex: index,
      action: isRelaxable(restriction) ? 'relax' : 'remove',
    }))

  return [...directiveCandidates, ...restrictionCandidates].slice(0, MAX_CANDIDATES)
}

/** 日数を 1 増やして緩める制約（上限だけ。下限を緩めても枠は増えない） */
function isRelaxable(
  restriction: Restriction
): restriction is Extract<
  Restriction,
  { kind: 'max_work_week' | 'max_work_consecutive' | 'max_weekend_days' }
> {
  return (
    restriction.kind === 'max_work_week' ||
    restriction.kind === 'max_work_consecutive' ||
    restriction.kind === 'max_weekend_days'
  )
}

/** 一手が指す制約の添字を id で引く（013 から）。id が無い・見つからないときは null */
function indexById(problem: Problem, restrictionId: string | null | undefined): number | null {
  if (!restrictionId) return null
  const index = problem.restrictions.findIndex((restriction) => restriction.id === restrictionId)
  return index === -1 ? null : index
}

/**
 * 画面のラベル（「」付き）が指す制約の添字。
 * 保存した添字がまだ同じ文言ならそれを使い、設定が変わっていたらラベルで引き直す。
 */
export function matchRestrictionIndex(
  problem: Problem,
  lever: { restrictionIndex: number | null; label: string }
): number | null {
  const labelOf = (index: number) => {
    const restriction = problem.restrictions[index]
    return restriction ? `「${restrictionLabel(problem, restriction)}」` : null
  }
  if (
    lever.restrictionIndex !== null &&
    sameRestrictionLabel(labelOf(lever.restrictionIndex), lever.label)
  ) {
    return lever.restrictionIndex
  }
  const found = problem.restrictions.findIndex((_, index) =>
    sameRestrictionLabel(labelOf(index), lever.label)
  )
  return found === -1 ? null : found
}

/** 添字の制約を外すか、日数を 1 増やす。添字が無ければ null */
export function relaxedRestrictionList(problem: Problem, index: number): Restriction[] | null {
  if (!problem.restrictions[index]) return null
  return relaxRestrictions(problem, index)
}

/**
 * 一手の実行で使う制約の並び。店舗の行は変えず、この問題だけを書き換える。
 *
 * 日数は「いまの値 + 1」ではなく、試算が示した `relaxedTo` にする。続けて緩めたときも、
 * 点線を出したときの日数と揃う（店舗の設定が 2 日のまま、試算が 4 日なら 4 日にする）。
 * すでにその日数以上なら、緩めたことにならないので null。
 */
export function restrictionsForLever(
  problem: Problem,
  lever: {
    restrictionIndex: number | null
    restrictionId?: string | null
    label: string
    action: 'remove' | 'relax'
    relaxedTo: number | null
  }
): Restriction[] | null {
  // id は同じ文言の制約が複数あるときの手がかりにだけ使う。文言の確認は外さない
  // （id が同じでも、あとで中身を書き換えた制約には当てない）
  const hinted = {
    ...lever,
    restrictionIndex: indexById(problem, lever.restrictionId) ?? lever.restrictionIndex,
  }
  if (lever.action === 'remove') {
    const index = matchRestrictionIndex(problem, hinted)
    if (index === null) return null
    return problem.restrictions.filter((_, i) => i !== index)
  }
  if (lever.relaxedTo === null) return null
  const index = findRelaxTarget(problem, hinted, lever.relaxedTo - 1)
  const current = index === null ? undefined : problem.restrictions[index]
  if (!current || !isRelaxable(current) || current.days >= lever.relaxedTo) return null
  const days = lever.relaxedTo
  return problem.restrictions.map((restriction, i) =>
    i === index && isRelaxable(restriction) ? { ...restriction, days } : restriction
  )
}

/** 日数の前後の空白だけ違う見出しは同じ制約とみなす */
function sameRestrictionLabel(a: string | null, b: string): boolean {
  return a !== null && tightenRestrictionDays(a) === tightenRestrictionDays(b)
}

/** 試算時点の日数（`relaxedTo - 1`）にしたときの文言が、一手のラベルと一致する制約 */
function findRelaxTarget(
  problem: Problem,
  lever: { restrictionIndex: number | null; label: string },
  previousDays: number
): number | null {
  const matches = (index: number) => {
    const restriction = problem.restrictions[index]
    if (!restriction || !isRelaxable(restriction)) return false
    return sameRestrictionLabel(
      `「${restrictionLabel(problem, { ...restriction, days: previousDays })}」`,
      lever.label
    )
  }
  if (lever.restrictionIndex !== null && matches(lever.restrictionIndex))
    return lever.restrictionIndex
  const found = problem.restrictions.findIndex((_, index) => matches(index))
  return found === -1 ? null : found
}

/** 候補の条件を緩めた制約の並び（外すものは除き、日数は 1 増やす） */
function relaxRestrictions(problem: Problem, index: number): Restriction[] {
  return problem.restrictions.flatMap((restriction, i) => {
    if (i !== index) return [restriction]
    if (!isRelaxable(restriction)) return []
    return [{ ...restriction, days: restriction.days + 1 }]
  })
}

/** 増える枠のパターンごとの内訳 */
function gainByPattern(problem: Problem, rows: PlanRow[]): { patternId: string; count: number }[] {
  const left = unfilledCounts(problem, rows)
  const counts = new Map<string, number>()
  for (const slot of problem.demand) {
    const filled = slot.count - (left.get(slotKey(slot.date, slot.patternId)) ?? 0)
    if (filled > 0) counts.set(slot.patternId, (counts.get(slot.patternId) ?? 0) + filled)
  }
  return problem.patterns
    .filter((pattern) => counts.has(pattern.id))
    .map((pattern) => ({ patternId: pattern.id, count: counts.get(pattern.id)! }))
}

/**
 * 試算の問題。**`input` は計画を入れる前の表**、`saved` はその実行で保存した計画。
 * 計画を既存シフトとして足すので、`requested` は残りの枠の数になる
 */
export function whatIfBase(input: AssistInput, saved: PlanRow[]): Problem {
  return buildProblem({
    ...input,
    shifts: [
      ...input.shifts,
      ...saved.map(({ staffId, date, patternId }) => ({ staffId, date, patternId })),
    ],
  })
}

export async function evaluateLevers(params: {
  /** 計画を入れる前の表 */
  input: AssistInput
  saved: PlanRow[]
  /** `request.directives`（外した指示を含む全件。添字がそのまま一手の `directiveIndex` になる） */
  directives: Directive[]
  disabled: ReadonlySet<number>
  relaxed: boolean
  unfilled: Pick<UnfilledSlot, 'breakdown'>[]
  /** この実行ですでに緩めた制約。次の一手は緩めたあとの並びに対して試す */
  restrictions?: Restriction[]
}): Promise<Lever[]> {
  const built = whatIfBase(params.input, params.saved)
  const base = params.restrictions ? { ...built, restrictions: params.restrictions } : built
  if (base.requested === 0) return []

  const candidates = leverCandidates(
    base,
    params.directives,
    params.disabled,
    params.relaxed,
    params.unfilled
  )
  const levers: Lever[] = []

  for (const candidate of candidates) {
    const problem =
      candidate.kind === 'restriction'
        ? { ...base, restrictions: relaxRestrictions(base, candidate.restrictionIndex) }
        : base
    const directives = params.directives.filter(
      (_, index) =>
        !params.disabled.has(index) &&
        !(candidate.kind === 'directive' && candidate.directiveIndex === index)
    )

    const solved = await planAssignments(problem, {
      directives,
      timeLimit: WHAT_IF_TIME_LIMIT,
    })
    const rows = validatePlan(problem, solved.plan).accepted
    const gain = filledCount(problem, rows)
    if (gain <= 0) continue

    if (candidate.kind === 'directive') {
      levers.push({
        kind: 'directive',
        label: describeDirective(base, params.directives[candidate.directiveIndex]),
        action: 'remove',
        relaxedTo: null,
        directiveIndex: candidate.directiveIndex,
        restrictionIndex: null,
        restrictionId: null,
        gain,
        byPattern: gainByPattern(problem, rows),
        rows,
      })
    } else {
      const restriction = base.restrictions[candidate.restrictionIndex]
      levers.push({
        kind: 'restriction',
        label: `「${restrictionLabel(base, restriction)}」`,
        action: candidate.action,
        relaxedTo: isRelaxable(restriction) ? restriction.days + 1 : null,
        directiveIndex: null,
        restrictionIndex: candidate.restrictionIndex,
        restrictionId: restriction.id,
        gain,
        byPattern: gainByPattern(problem, rows),
        rows,
      })
    }
  }

  // 同点は候補の順（指示が先、制約は理由に出た回数の多い順）
  return levers
    .map((lever, index) => ({ lever, index }))
    .sort((a, b) => b.lever.gain - a.lever.gain || a.index - b.index)
    .slice(0, MAX_LEVERS)
    .map(({ lever }) => lever)
}
