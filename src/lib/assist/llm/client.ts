import 'server-only'
import OpenAI from 'openai'

/**
 * LLM の接続先（012 §3.11 / §5.10）。Vercel AI Gateway をシステムクレジットで使う（BYOK は使わない）。
 *
 * **OpenAI 公式 API（直接）へ切り替えるときは下の 2 行だけを変える**: キーを `OPENAI_API_KEY`、`baseURL` を外し、
 * モデル ID の接頭辞（`openai/`）を取る。どちらの経路でもスタッフ名は海外で処理される（§3.5）。
 *
 * キーが無い環境では null を返し、ボタンは「現在利用できません」になる（他の機能に影響しない）。
 */

const GATEWAY_BASE_URL = 'https://ai-gateway.vercel.sh/v1'

export const DEFAULT_INTERPRET_MODEL = 'openai/gpt-6-sol'

export type AssistLlm = {
  client: OpenAI
  via: 'gateway'
  models: { interpret: string }
}

function apiKey(): string | undefined {
  return process.env.AI_GATEWAY_API_KEY || undefined
}

/** キーがあるか（page がボタンの可否に使う。クライアントは作らない） */
export function isAssistAvailable(): boolean {
  return apiKey() !== undefined
}

export function getAssistLlm(): AssistLlm | null {
  const key = apiKey()
  if (!key) return null
  return {
    // timeout 60 秒・再試行 2 回（§5.7）
    client: new OpenAI({ apiKey: key, baseURL: GATEWAY_BASE_URL, timeout: 60_000, maxRetries: 2 }),
    via: 'gateway',
    models: {
      // 評価用に上書きできる（`anthropic/claude-sonnet-5` のようにゲートウェイ経由で他社も指せる）
      interpret: process.env.ASSIST_INTERPRET_MODEL || DEFAULT_INTERPRET_MODEL,
    },
  }
}
