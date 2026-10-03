import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ActionError, fail } from '@/lib/actions/error'
import { addDays } from '@/lib/calendar/dateString'
import { pageAll } from '@/lib/queries/pageAll'
import { cellKey } from '@/lib/shifts/key'
import {
  ASSIST_BUDGET_MESSAGE,
  ASSIST_LEVER_NOT_FOUND_MESSAGE,
  ASSIST_RUN_NOT_FOUND_MESSAGE,
} from '@/lib/validation/assist'
import { TENANT_NOT_FOUND_MESSAGE } from '@/lib/validation/tenants'
import type { Database, Json } from '@/types/database'
import {
  describeDirective,
  evaluateDirective,
  type Directive,
  type Interpretation,
} from './directives'
import { planAssignments, SolverError } from './engine'
import { evaluateLevers, restrictionsForLever, WHAT_IF_TIME_LIMIT, type Lever } from './levers'
import { restrictionOutcomes } from './restrictionOutcomes'
import type { AssistLlm } from './llm/client'
import { interpretInstructions } from './llm/interpret'
import { LlmError } from './llm/structured'
import { loadAssistInput } from './load'
import { changedRatio, computeMetrics } from './metrics'
import { totalCost, type LlmUsage } from './pricing'
import { buildProblem, slotKey, type AssistInput, type PlanRow, type Problem } from './problem'
import { explainUnfilled, unfilledCounts } from './reasons'
import type { AssistInterpretation, AssistResult } from './result'
import { stateOf, validatePlan } from './validate'

type Client = SupabaseClient<Database>

/**
 * 自動アサインの 1 実行（012 §5.1 の 1〜8）。
 *
 * **リクエスト文脈（cookie）に依存させない**（§3.4）: DB クライアント・店舗 id・期間・指示を引数で受け、
 * 中のクエリは必ず店舗 id を条件に入れる。同期版は Server Action がユーザーのクライアントを渡す。
 * 途中で失敗したら run を failed にし、書き込み済みの行は消す（表は変わらない。「別の案」の rollback を除く）。
 */

export type RunAssistParams = {
  supabase: Client
  tenantId: string
  runId: string
  period: { start: string; end: string }
  startOfWeek: number
  instructions: string
  /** 「別の案を作る」の前の run。解く前に元に戻し、その `result.plan` をペナルティに使う（§3.10） */
  retryOfRunId: string | null
  previousPlan: PlanRow[] | null
  /**
   * 前の run の指示をそのまま使う（LLM を呼ばない。§11.3）。「別の案」で本文が変わっていないときと、一手の実行。
   * null なら本文を解釈する
   */
  directives: StoredDirectives | null
  /**
   * 一手の実行（§11.3）: 前の run の、いま残っている下書き。消さずに既存として残して空いた枠だけを解き、
   * 最後に新しい run へ付け替える。分母・理由は「この行を除いた表」で数える
   */
  keep: { runId: string; rows: PlanRow[] } | null
  /** null なら LLM を呼ばない（指示は `directives` があるときだけ効く。評価・ローカル検証用） */
  llm: AssistLlm | null
  /**
   * 制約の一手（この実行だけ）。店舗の `restrictions` は書き換えない。
   * 添字は試算時の問題の並び。ラベルが一致しなければ引き直す。
   */
  relaxRestriction: {
    restrictionIndex: number | null
    /** 013 から。規則の id が今もあればそれで引く（無い・古い run はラベルで引き直す） */
    restrictionId: string | null
    label: string
    action: 'remove' | 'relax'
    relaxedTo: number | null
  } | null
}

/** run の `request` に保存し、次の実行が読み直す指示（§11.3） */
export type StoredDirectives = {
  directives: Directive[]
  interpretations: Interpretation[]
  /** 外した指示の `directives` の添字 */
  disabled: number[]
}

const INTERPRET_FAILED_MESSAGE = '指示を解釈できませんでした。時間をおいてもう一度お試しください'
const SOLVE_FAILED_MESSAGE = '割り当てを計算できませんでした'
const NOTHING_TO_FILL_MESSAGE = '不足している枠がありません'

/** RPC の例外を文言に写す（actions.ts の RPC_MESSAGES と同じ粒度。存在を漏らさない） */
function failFromRollback(error: { message: string }): never {
  if (error.message.includes('tenant not found')) fail(TENANT_NOT_FOUND_MESSAGE)
  if (error.message.includes('run not found')) fail(ASSIST_RUN_NOT_FOUND_MESSAGE)
  throw error
}

function interpretFailure(error: unknown): ActionError {
  if (error instanceof LlmError && error.kind === 'budget')
    return new ActionError(ASSIST_BUDGET_MESSAGE)
  console.warn('[assist] interpret failed', error)
  return new ActionError(INTERPRET_FAILED_MESSAGE)
}

/**
 * upsert（既存は上書きしない）→ `assist_run_id` で読み戻す。
 *
 * solve 中に手で入れたセルと衝突した行は `ignoreDuplicates` で黙って落ち、読み戻しにも現れない。
 * **読み戻しで親とペアが片方だけになった組は、残った側も消す**（§5.1。片方だけを保存しない）。
 */
async function saveAndReadBack(
  supabase: Client,
  tenantId: string,
  runId: string,
  problem: Problem,
  accepted: PlanRow[]
): Promise<PlanRow[]> {
  if (accepted.length === 0) return []

  const { error } = await supabase.from('shifts').upsert(
    accepted.map((row) => ({
      tenant_id: tenantId,
      staff_id: row.staffId,
      pattern_id: row.patternId,
      date: row.date,
      // 自動で入れたものは見直す前提なので下書き（§1）
      fixed: false,
      assist_run_id: runId,
    })),
    { onConflict: 'staff_id,date', ignoreDuplicates: true }
  )
  if (error) {
    // 別タブでスタッフや勤務パターンが削除された（複合 FK）
    if (error.code === '23503')
      fail('スタッフまたは勤務パターンが見つかりません。画面を読み直してください')
    if (error.code === '42501') fail(TENANT_NOT_FOUND_MESSAGE)
    throw error
  }

  const saved = await pageAll((from, to, withCount) =>
    supabase
      .from('shifts')
      .select('id, staff_id, pattern_id, date', withCount ? { count: 'exact' } : undefined)
      .eq('tenant_id', tenantId)
      .eq('assist_run_id', runId)
      .order('date', { ascending: true })
      .order('staff_id', { ascending: true })
      .range(from, to)
  )

  const rows = saved.map((row) => {
    const planRow = { staffId: row.staff_id, date: row.date, patternId: row.pattern_id }
    return { id: row.id, key: rowKey(planRow), ...planRow }
  })
  const sources = new Map(accepted.map((row) => [rowKey(row), row.source]))
  const byKey = new Map(rows.map((row) => [row.key, row]))

  // 親とペアのどちらか一方だけが入った組は、入った側も消す
  const orphanIds: string[] = []
  for (const [parentKey, pairKey] of pairUnits(problem, accepted)) {
    const parent = byKey.get(parentKey)
    const pair = byKey.get(pairKey)
    if (parent && !pair) orphanIds.push(parent.id)
    if (pair && !parent) orphanIds.push(pair.id)
  }
  if (orphanIds.length > 0) {
    const { error: deleteError } = await supabase
      .from('shifts')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('assist_run_id', runId)
      .in('id', orphanIds)
    if (deleteError) throw deleteError
  }

  const orphans = new Set(orphanIds)
  return rows
    .filter((row) => !orphans.has(row.id))
    .map(({ staffId, date, patternId, key }) => ({
      staffId,
      date,
      patternId,
      source: sources.get(key) ?? 'assign',
    }))
}

function rowKey(row: { staffId: string; date: string; patternId: string }): string {
  return `${cellKey(row.staffId, row.date)}|${row.patternId}`
}

/** 受理した計画の中の（親, ペア）のキーの組。validate が「親の翌日・ペア先のパターン」を保証している */
function pairUnits(problem: Problem, plan: PlanRow[]): [string, string][] {
  const pairs = new Map(
    plan.filter((row) => row.source === 'pair').map((row) => [cellKey(row.staffId, row.date), row])
  )
  const units: [string, string][] = []
  for (const row of plan) {
    if (row.source !== 'assign') continue
    const pair = pairs.get(cellKey(row.staffId, addDays(row.date, 1)))
    if (pair && pair.patternId === problem.patternById.get(row.patternId)?.pairPatternId) {
      units.push([rowKey(row), rowKey(pair)])
    }
  }
  return units
}

function interpretationViews(
  problem: Problem,
  plan: PlanRow[],
  directives: Directive[],
  interpretations: Interpretation[],
  disabled: ReadonlySet<number>
): AssistInterpretation[] {
  const state = stateOf(problem, plan)
  const left = unfilledCounts(problem, plan)
  const unfilledAt = (date: string, patternId: string) => left.get(slotKey(date, patternId)) ?? 0

  return interpretations.map((item) => {
    if (item.directive === null) {
      return { text: item.text, label: null, hard: null, status: 'unsupported', detail: item.note }
    }
    const directive = directives[item.directive]
    if (disabled.has(item.directive)) {
      return {
        text: item.text,
        label: describeDirective(problem, directive),
        hard: directive.hard,
        status: 'removed',
        detail: null,
      }
    }
    const outcome = evaluateDirective(problem, state, directive, unfilledAt)
    return {
      text: item.text,
      label: describeDirective(problem, directive),
      hard: directive.hard,
      status: outcome.kept ? 'kept' : 'broken',
      detail: outcome.detail || null,
    }
  })
}

function errorText(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.slice(0, 500)
}

/** 表から、残す行（一手の実行の前の下書き）を除いた入力。分母・理由・試算の起点になる（§11.3） */
function withoutRows(input: AssistInput, rows: PlanRow[]): AssistInput {
  if (rows.length === 0) return input
  const keys = new Set(rows.map((row) => cellKey(row.staffId, row.date)))
  return {
    ...input,
    shifts: input.shifts.filter((shift) => !keys.has(cellKey(shift.staffId, shift.date))),
  }
}

export async function runAssist(params: RunAssistParams): Promise<AssistResult> {
  const { supabase, tenantId, runId } = params
  const started = Date.now()
  const elapsed: Record<string, number> = {}
  const timed = async <T>(stage: string, fn: () => Promise<T>): Promise<T> => {
    const at = Date.now()
    try {
      return await fn()
    } finally {
      elapsed[stage] = Date.now() - at
    }
  }
  const usage: { interpret: LlmUsage | null } = { interpret: null }
  const usageJson = () =>
    ({
      interpret: usage.interpret,
      costUsd: totalCost([usage.interpret]),
      elapsedMs: { ...elapsed, total: Date.now() - started },
    }) as unknown as Json

  let wrote = false

  try {
    // 0. 「別の案を作る」: 前の案を元に戻してから解く（§5.1）
    if (params.retryOfRunId) {
      const { error } = await supabase.rpc('rollback_assist_run', {
        p_tenant_id: tenantId,
        p_run_id: params.retryOfRunId,
      })
      if (error) failFromRollback(error)
    }

    // 1〜2. 読む・問題を組む。一手の実行は、前の下書きを除いた表で数え（problem）、残したまま解く（solveProblem）
    const input = await timed('load', () =>
      loadAssistInput(supabase, tenantId, params.period, params.startOfWeek)
    )
    const existingKeys = new Set(input.shifts.map((shift) => cellKey(shift.staffId, shift.date)))
    // 付け替えのあいだに消された・確定に変えられた行は残す対象から外す（下書きとして表に残っているものだけ）
    const keep = (params.keep?.rows ?? []).filter((row) =>
      existingKeys.has(cellKey(row.staffId, row.date))
    )
    const baseInput = withoutRows(input, keep)
    let problem = buildProblem(baseInput)
    let solveProblem = keep.length > 0 ? buildProblem(input) : problem
    if (params.relaxRestriction) {
      const restrictions = restrictionsForLever(problem, params.relaxRestriction)
      if (!restrictions) fail(ASSIST_LEVER_NOT_FOUND_MESSAGE)
      problem = { ...problem, restrictions }
      solveProblem = { ...solveProblem, restrictions }
    }
    if (problem.requested === 0 || solveProblem.requested === 0) fail(NOTHING_TO_FILL_MESSAGE)

    // 3. 指示。前の run の指示をそのまま使うか、本文を解釈する（指示があるときだけ）。解釈に失敗したら中断する
    let stored: StoredDirectives = params.directives ?? {
      directives: [],
      interpretations: [],
      disabled: [],
    }
    if (!params.directives && params.instructions && params.llm) {
      const llm = params.llm
      try {
        const interpreted = await timed('interpret', () =>
          interpretInstructions(llm, problem, params.instructions)
        )
        stored = { ...interpreted, disabled: [] }
        usage.interpret = interpreted.usage
      } catch (error) {
        throw interpretFailure(error)
      }
    }
    const disabled = new Set(stored.disabled)
    const directives = stored.directives.filter((_, index) => !disabled.has(index))

    // 4. 解く（解が無ければ、必須の下限だけ → 指示だけ → 両方の順にソフトに落として解き直す。engine.ts）
    const solved = await timed('solve', async () => {
      try {
        return await planAssignments(solveProblem, {
          directives,
          previousPlan: params.previousPlan ?? undefined,
          // 一手の実行は試算と同じ問題を同じ上限で解く（点線どおりに入るように。§11.3）
          timeLimit: params.keep ? WHAT_IF_TIME_LIMIT : undefined,
        })
      } catch (error) {
        if (error instanceof SolverError) {
          console.error('[assist] solver', error)
          fail(SOLVE_FAILED_MESSAGE)
        }
        throw error
      }
    })

    // 5. 最後の門番。MILP が正しければ何も落ちない。落ちたらモデルのバグなので黙って保存しない
    const validation = validatePlan(solveProblem, solved.plan)
    if (validation.rejected.length > 0) {
      console.warn(
        `[assist] validatePlan rejected ${validation.rejected.length} units`,
        validation.rejected.slice(0, 5)
      )
    }

    // 7. 保存して読み戻す（理由や試算より先に永続化する。§5.1）
    wrote = true
    const added = await timed('save', () =>
      saveAndReadBack(supabase, tenantId, runId, solveProblem, validation.accepted)
    )
    const saved = [...keep, ...added]

    // 6. 理由・指標・指示の評価（読み戻した行で数える）
    const metrics = computeMetrics(problem, saved)
    const unfilled = explainUnfilled(problem, saved, {
      shortageOptimal: solved.solver.shortageOptimal,
      hardDirectives: !solved.solver.relaxed && directives.some((directive) => directive.hard),
    })

    // 8. 効く一手（§11.2）。失敗しても run は成功のまま（一手が出ないだけ）
    let levers: Lever[] = []
    try {
      levers = await timed('levers', () =>
        evaluateLevers({
          input: baseInput,
          saved,
          directives: stored.directives,
          disabled,
          relaxed: solved.solver.relaxed,
          unfilled,
          // この実行で緩めた制約のまま次の一手を試す（同じ条件をすぐもう一度出さない）
          restrictions: params.relaxRestriction ? problem.restrictions : undefined,
        })
      )
    } catch (error) {
      console.warn('[assist] levers failed', error)
    }

    const result: AssistResult = {
      requested: problem.requested,
      filled: metrics.filled,
      unfilled,
      rejected: validation.rejected.map((unit) => ({
        rows: unit.rows,
        violations: unit.violations.map(({ code, message }) => ({ code, message })),
      })),
      plan: saved,
      interpretations: interpretationViews(
        problem,
        saved,
        stored.directives,
        stored.interpretations,
        disabled
      ),
      levers,
      restrictionOutcomes: restrictionOutcomes(problem, saved),
      metrics: {
        fillRate: metrics.fillRate,
        utilization: metrics.utilization,
        weekends: metrics.weekends,
      },
      solver: solved.solver,
      changedRatio: params.previousPlan ? changedRatio(params.previousPlan, saved) : null,
      retryOfRunId: params.retryOfRunId,
    }

    const request = {
      requested: problem.requested,
      staffs: problem.staffs.map(({ id, code, name }) => ({ id, code, name })),
      patterns: problem.patterns.map(({ id, code, name }) => ({ id, code, name })),
      restrictions: problem.restrictions,
      directives: stored.directives,
      interpretations: stored.interpretations,
      disabledDirectives: stored.disabled,
      keptFromRunId: params.keep?.runId ?? null,
    }
    const { error } = await supabase
      .from('assist_runs')
      .update({
        status: 'succeeded',
        request: request as unknown as Json,
        result: result as unknown as Json,
        usage: usageJson(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', runId)
    if (error) throw error

    // 9. 一手の実行: 前の run の下書きを新しい run に付け替える（「元に戻す」で両方が消える）。
    // run を成功にしたあとに置く。ここで失敗しても表は正しく、前の下書きが前の run に残るだけなので、失敗にしない
    if (params.keep) await moveDrafts(supabase, tenantId, params.keep.runId, runId)

    return result
  } catch (error) {
    // 書き込んだ後の失敗は、その実行で入った下書きを消して表を元に戻す（残す行は前の run のまま）
    if (wrote) {
      const { error: cleanupError } = await supabase
        .from('shifts')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('assist_run_id', runId)
        .eq('fixed', false)
      if (cleanupError) console.error('[assist] cleanup failed', cleanupError)
    }
    const { error: markError } = await supabase
      .from('assist_runs')
      .update({ status: 'failed', error: errorText(error), usage: usageJson() })
      .eq('tenant_id', tenantId)
      .eq('id', runId)
    if (markError) console.error('[assist] mark failed', markError)
    throw error
  }
}

/**
 * 前の run の下書きを新しい run に付け替え、前の run を確認済みにする（§11.3）。
 * 付け替えは run id の条件だけで書く（行の id を URL に並べない）。
 */
async function moveDrafts(
  supabase: Client,
  tenantId: string,
  fromRunId: string,
  toRunId: string
): Promise<void> {
  const { error } = await supabase
    .from('shifts')
    .update({ assist_run_id: toRunId })
    .eq('tenant_id', tenantId)
    .eq('assist_run_id', fromRunId)
    .eq('fixed', false)
  if (error) {
    console.error('[assist] move drafts failed', error)
    return
  }
  const { error: ackError } = await supabase
    .from('assist_runs')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('id', fromRunId)
  if (ackError) console.error('[assist] acknowledge previous run failed', ackError)
}
