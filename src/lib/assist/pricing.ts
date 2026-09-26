/**
 * 単価表と費用の概算（012 §5.9）。USD / 100 万トークン。ゲートウェイは上乗せなし（§3.11）なので定価で計算する。
 * 表に無いモデルは費用を null にする（評価で他社モデルを指したときなど。黙って 0 にしない）。
 */
const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  'gpt-6-sol': { input: 2, cachedInput: 0.2, output: 10 },
  // キャッシュ入力の単価は未公表。入力の 1 割で見積もる
  'gpt-6-luna': { input: 0.1, cachedInput: 0.01, output: 0.5 },
  'claude-opus-5': { input: 5, cachedInput: 0.5, output: 25 },
  'claude-sonnet-5': { input: 2, cachedInput: 0.2, output: 10 },
}

export type LlmUsage = {
  model: string
  input: number
  cached: number
  /** 推論トークンを含む出力（Responses API は推論も出力に数える） */
  output: number
  reasoning: number
  costUsd: number | null
  elapsedMs: number
}

/** `openai/gpt-6-sol` → `gpt-6-sol`（ゲートウェイの接頭辞を外して引く） */
function priceOf(model: string) {
  const bare = model.includes('/') ? model.slice(model.indexOf('/') + 1) : model
  return PRICES[bare] ?? null
}

export function estimateCost(
  model: string,
  usage: { input: number; cached: number; output: number }
): number | null {
  const price = priceOf(model)
  if (!price) return null
  const uncached = Math.max(0, usage.input - usage.cached)
  const cost =
    (uncached * price.input + usage.cached * price.cachedInput + usage.output * price.output) /
    1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000
}

/** 実行全体の費用。どれか 1 つでも不明なら null */
export function totalCost(usages: (LlmUsage | null | undefined)[]): number | null {
  let total = 0
  for (const usage of usages) {
    if (!usage) continue
    if (usage.costUsd === null) return null
    total += usage.costUsd
  }
  return Math.round(total * 1_000_000) / 1_000_000
}
