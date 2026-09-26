import 'server-only'
import loadHighs from 'highs'
import { shortageCap, shortageObjective, type AssistModel } from '../model'

/**
 * HiGHS（WASM）の薄い包み（012 §3.2 / §5.11）。ソルバーを替えるときはこのディレクトリの中だけが変わる。
 *
 * **2 段で解く。** 1 段目は不足の合計だけを最小化し（厳密。`mip_rel_gap: 0`）、2 段目は不足の合計を 1 段目の値に固定して
 * 公平性・指示・デフォルトを最適化する（`mip_rel_gap` まで）。1 段で解くと、不足が多い店舗では相対ギャップ 2% が
 * 不足 1 枠（重み 1000）より大きくなり、埋められる枠を残したまま止まりうる。1 段目が最適なら
 * 「不足は最小」とソルバーの最適性から言える（理由の「別の枠に配置」の根拠。§5.6）。
 *
 * `solve()` は同期で CPU を占有する。Fluid compute は 1 インスタンスで複数リクエストを捌くので `time_limit` を短く保つ。
 */

type Highs = Awaited<ReturnType<typeof loadHighs>>

/** ローダーはモジュールスコープで 1 回だけ（コールドスタート以外は 0 ms） */
let highsPromise: Promise<Highs> | null = null
function getHighs(): Promise<Highs> {
  highsPromise ??= loadHighs()
  return highsPromise
}

export type StageResult = {
  /** HiGHS の `Status`（`Optimal` / `Time limit reached` / `Infeasible` など） */
  status: string
  objective: number | null
  elapsedMs: number
}

export type SolveOutcome =
  | { kind: 'solved'; values: Map<string, number>; shortageOptimal: boolean; stages: StageResult[] }
  | { kind: 'infeasible'; stages: StageResult[] }
  | { kind: 'failed'; stages: StageResult[]; message: string }

export type SolveOptions = {
  /** 1 段あたりの上限（秒） */
  timeLimit: number
  /** 2 段目の相対ギャップ */
  gap: number
}

export const HIGHS_VERSION = 'highs 1.15.3'

function run(highs: Highs, lp: string, timeLimit: number, gap: number) {
  const started = Date.now()
  const result = highs.solve(lp, {
    time_limit: timeLimit,
    mip_rel_gap: gap,
    output_flag: false,
  })
  const elapsedMs = Date.now() - started

  const values = new Map<string, number>()
  let feasible = false
  for (const [name, column] of Object.entries(result.Columns)) {
    if ('Primal' in column && typeof column.Primal === 'number') {
      values.set(name, column.Primal)
      feasible = true
    }
  }
  // 解が無い状態（Infeasible など）では ObjectiveValue を読まない
  const hasSolution =
    feasible && (result.Status === 'Optimal' || result.Status === 'Time limit reached')
  return {
    stage: {
      status: result.Status,
      objective: hasSolution ? result.ObjectiveValue : null,
      elapsedMs,
    },
    values: hasSolution ? values : null,
  }
}

export async function solve(model: AssistModel, options: SolveOptions): Promise<SolveOutcome> {
  if (model.builder.staticallyInfeasible) {
    return { kind: 'infeasible', stages: [{ status: 'Infeasible', objective: null, elapsedMs: 0 }] }
  }

  const highs = await getHighs()
  const first = run(highs, model.builder.toLp(shortageObjective(model)), options.timeLimit, 0)
  if (first.stage.status === 'Infeasible') return { kind: 'infeasible', stages: [first.stage] }
  if (!first.values || first.stage.objective === null) {
    return { kind: 'failed', stages: [first.stage], message: first.stage.status }
  }

  const second = run(
    highs,
    model.builder.toLp(model.builder.objective, [shortageCap(model, first.stage.objective)]),
    options.timeLimit,
    options.gap
  )
  return {
    kind: 'solved',
    // 2 段目が時間内に解を出せなかったときは 1 段目の解を使う（不足は最小のまま、公平性だけが整っていない）
    values: second.values ?? first.values,
    shortageOptimal: first.stage.status === 'Optimal',
    stages: [first.stage, second.stage],
  }
}
