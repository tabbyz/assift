import 'server-only'
import type { Directive } from './directives'
import { buildModel, planFromValues } from './model'
import type { PlanRow, Problem } from './problem'
import { HIGHS_VERSION, solve, type StageResult } from './solver/highs'
import type { Weights } from './weights'

/**
 * 割り当てを解く（012 §5.1 の 4）。MILP を組んで HiGHS で解き、**ハードな指示で解が無くなったら
 * ハードな指示をすべてソフトに落として 1 回だけ解き直す**（§3.9。どの指示が原因かは個別に探索しない）。
 *
 * restrictions 由来の制約はハードのままでも常に解がある（全変数 0・不足 = 枠数が実行可能）。
 * 解が無くなりうるのは「必ず」の指示だけ。
 */

export type SolverSummary = {
  solver: string
  /** 不足の最小性がソルバーの最適性で言えるか（1 段目が Optimal）。理由の文言を分ける（§5.6） */
  shortageOptimal: boolean
  /** ハードな指示をソフトに落として解き直したか */
  relaxed: boolean
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
  let model = buildModel(problem, modelOptions)
  if (model.cells.size === 0) {
    // 候補が 1 人もいない（全枠が候補なし）。解くまでもなく空の計画
    return {
      plan: [],
      solver: {
        solver: HIGHS_VERSION,
        shortageOptimal: true,
        relaxed,
        stages: [],
        variables: 0,
        constraints: model.builder.constraintCount,
        elapsedMs: Date.now() - started,
      },
    }
  }

  let outcome = await solve(model, solveOptions)
  const stages = [...outcome.stages]
  if (outcome.kind === 'infeasible' && model.hasHardDirectives) {
    relaxed = true
    model = buildModel(problem, { ...modelOptions, relaxDirectives: true })
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
      stages,
      variables: model.builder.binaryCount,
      constraints: model.builder.constraintCount,
      elapsedMs: Date.now() - started,
    },
  }
}
