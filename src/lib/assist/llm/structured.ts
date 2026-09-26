import 'server-only'
import { APIError } from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { ReasoningEffort } from 'openai/resources/shared'
import type { z } from 'zod'
import { estimateCost, type LlmUsage } from '../pricing'
import type { AssistLlm } from './client'

/**
 * 構造化出力の 1 呼び出し（012 §5.10）。Responses API + `zodTextFormat`。
 *
 * - `store: false` を必ず付ける（Responses API は既定で応答を 30 日保存する。取得し直す用途は無い）
 * - `max_output_tokens` は推論トークンも含む。小さくすると `incomplete` で失敗する
 * - `output_parsed` が null / `status` が `incomplete` / refusal は失敗として扱う
 */

export type LlmErrorKind = 'budget' | 'refusal' | 'incomplete' | 'invalid' | 'api'

export class LlmError extends Error {
  constructor(
    readonly kind: LlmErrorKind,
    message: string
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

export type StructuredCall<T extends z.ZodType> = {
  model: string
  instructions: string
  input: string
  schema: T
  name: string
  effort: ReasoningEffort
  maxOutputTokens: number
  /** 既定はクライアントの 60 秒・再試行 2 回（§5.7）。長い生成（評価の案 A）だけが上書きする */
  request?: { timeoutMs: number; maxRetries: number }
}

export async function callStructured<T extends z.ZodType>(
  llm: AssistLlm,
  call: StructuredCall<T>
): Promise<{ parsed: z.infer<T>; usage: LlmUsage }> {
  const started = Date.now()

  let response
  try {
    response = await llm.client.responses.parse(
      {
        model: call.model,
        instructions: call.instructions,
        input: call.input,
        text: { format: zodTextFormat(call.schema, call.name) },
        reasoning: { effort: call.effort },
        max_output_tokens: call.maxOutputTokens,
        store: false,
      },
      call.request
        ? { timeout: call.request.timeoutMs, maxRetries: call.request.maxRetries }
        : undefined
    )
  } catch (error) {
    // ゲートウェイの予算超過は 402（§3.11）
    if (error instanceof APIError && error.status === 402) {
      throw new LlmError('budget', 'AI Gateway の予算を超えました')
    }
    if (error instanceof APIError)
      throw new LlmError('api', `${error.status ?? '-'} ${error.message}`)
    // 応答の JSON がスキーマに合わない（SDK の parse が Zod / JSON の例外を投げる）
    throw new LlmError('invalid', error instanceof Error ? error.message : String(error))
  }

  if (response.status === 'incomplete') {
    throw new LlmError('incomplete', response.incomplete_details?.reason ?? 'incomplete')
  }
  const refused = response.output.some(
    (item) => item.type === 'message' && item.content.some((content) => content.type === 'refusal')
  )
  if (refused) throw new LlmError('refusal', 'refusal')
  if (response.output_parsed === null || response.output_parsed === undefined) {
    throw new LlmError('invalid', 'output_parsed が空')
  }

  const usage = response.usage
  const counts = {
    input: usage?.input_tokens ?? 0,
    cached: usage?.input_tokens_details?.cached_tokens ?? 0,
    output: usage?.output_tokens ?? 0,
  }
  return {
    parsed: response.output_parsed as z.infer<T>,
    usage: {
      model: call.model,
      ...counts,
      reasoning: usage?.output_tokens_details?.reasoning_tokens ?? 0,
      costUsd: estimateCost(call.model, counts),
      elapsedMs: Date.now() - started,
    },
  }
}
