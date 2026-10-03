import 'server-only'
import type { Directive } from './directives'
import { buildModel, planFromValues } from './model'
import type { PlanRow, Problem } from './problem'
import { HIGHS_VERSION, solve, type StageResult } from './solver/highs'
import type { Weights } from './weights'

/**
 * 割り当てを解く（012 §5.1 の 4）。MILP を組んで HiGHS で解き、解が無くなったら順に緩める（§3.9 / 013 §3.5）:
 *
 * 1. 必須の下限の制約（週の最低勤務日数）だけをソフトに落として解き直す。店長がこの実行で書いた「必ず」の指示を、
 *    設定に残っている規則より優先する（規則 1 つが守れないだけで、すべての指示を緩めない）
 * 2. だめなら、ハードな指示だけをソフトに落とす（規則は必須のまま。指示だけが原因なら規則を巻き込まない）
 * 3. それでも解が無ければ、両方をソフトに落とす
 *
 * どの条件が原因かは個別に探索しない。
 *
 * 上限の制約（週の上限・連勤・組み合わせ・土日祝の上限）は必須のままでも常に解がある（全変数 0・不足 = 枠数が実行可能）。
 * 解が無くなりうるのは「必ず」の指示と、必須の週の最低勤務日数だけ。
 */

export type SolverSummary = {
  solver: string
  /** 不足の最小性がソルバーの最適性で言えるか（1 段目が Optimal）。理由の文言を分ける（§5.6） */
  shortageOptimal: boolean
  /** ハードな指示をソフトに落として解き直したか（結果に「『必ず』の指示を守れなかった」と出す） */
  relaxed: boolean
  /** 必須の下限の制約をソフトに落として解き直したか（013。守れなかった規則は `restrictionOutcomes` に出る） */
  relaxedRestrictions: boolean
  stages: StageResult[]
  variables: number
  constraints: number
  elapsedMs: number
}

export type EngineOptions = {
  directives?: Directive[]
  previousPlan?: PlanRow[]
  weights?: Weights
  /** 1 段あたりの上限（秒）。Fluid compute で CPU を占有しすぎないよう 5 秒（§5.7） */
  timeLimit?: number
  gap?: number
}

export class SolverError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SolverError'
  }
}

export async function planAssignments(
  problem: Problem,
  options: EngineOptions = {}
): Promise<{ plan: PlanRow[]; solver: SolverSummary }> {
  const started = Date.now()
  const solveOptions = { timeLimit: options.timeLimit ?? 5, gap: options.gap ?? 0.02 }
  const modelOptions = {
    directives: options.directives,
    previousPlan: options.previousPlan,
    weights: options.weights,
  }

  let relaxed = false
  let relaxedRestrictions = false
  let model = buildModel(problem, modelOptions)
  if (model.cells.size === 0) {
    // 候補が 1 人もいない（全枠が候補なし）。解くまでもなく空の計画
    return {
      plan: [],
      solver: {
        solver: HIGHS_VERSION,
        shortageOptimal: true,
        relaxed,
        relaxedRestrictions,
        stages: [],
        variables: 0,
        constraints: model.builder.constraintCount,
        elapsedMs: Date.now() - started,
      },
    }
  }

  let outcome = await solve(model, solveOptions)
  const stages = [...outcome.stages]
  const { hasHardMinRestrictions, hasHardDirectives } = model
  // 緩める順（013 §3.5）: 規則だけ → 指示だけ → 両方。どちらかだけで解けるなら、もう片方は必須のまま守る。
  // 解が無いことは 1 段目ですぐ分かる（不足を最小化する前に止まる）ので、試す回数が増えても重くない
  const steps: { relaxRestrictions: boolean; relaxDirectives: boolean }[] = [
    ...(hasHardMinRestrictions ? [{ relaxRestrictions: true, relaxDirectives: false }] : []),
    ...(hasHardDirectives ? [{ relaxRestrictions: false, relaxDirectives: true }] : []),
    ...(hasHardMinRestrictions && hasHardDirectives
      ? [{ relaxRestrictions: true, relaxDirectives: true }]
      : []),
  ]
  for (const step of steps) {
    if (outcome.kind !== 'infeasible') break
    relaxedRestrictions = step.relaxRestrictions
    relaxed = step.relaxDirectives
    model = buildModel(problem, { ...modelOptions, ...step })
    outcome = await solve(model, solveOptions)
    stages.push(...outcome.stages)
  }

  if (outcome.kind !== 'solved') {
    throw new SolverError(
      outcome.kind === 'failed' ? `solver failed: ${outcome.message}` : 'solver: infeasible'
    )
  }

  return {
    plan: planFromValues(problem, model, outcome.values),
    solver: {
      solver: HIGHS_VERSION,
      shortageOptimal: outcome.shortageOptimal,
      relaxed,
      relaxedRestrictions,
      stages,
      variables: model.builder.binaryCount,
      constraints: model.builder.constraintCount,
      elapsedMs: Date.now() - started,
    },
  }
}
