import 'server-only'
import {
  interpretOutputSchema,
  resolveDirectives,
  type Directive,
  type Interpretation,
} from '../directives'
import type { LlmUsage } from '../pricing'
import type { Problem } from '../problem'
import type { AssistLlm } from './client'
import { INTERPRET_INSTRUCTIONS, interpretInput } from './prompts'
import { callStructured } from './structured'

/**
 * 店長の指示 → Directive[]（012 §5.5）。指示があるときだけ呼ぶ。
 *
 * GPT-6 Sol・`effort: 'medium'`（曖昧な日本語を型に落とす判断力が要る。§3.3）。
 * 出力は小さい（〜500 tok）が推論トークンも `max_output_tokens` に数えるので 16000（§5.10）。
 * 失敗したら呼び出し側（run.ts）が「指示を解釈できませんでした」で**中断**する（黙って無視して作らない）。
 */
export async function interpretInstructions(
  llm: AssistLlm,
  problem: Problem,
  instructions: string
): Promise<{ directives: Directive[]; interpretations: Interpretation[]; usage: LlmUsage }> {
  const { parsed, usage } = await callStructured(llm, {
    model: llm.models.interpret,
    instructions: INTERPRET_INSTRUCTIONS,
    input: interpretInput(problem, instructions),
    schema: interpretOutputSchema,
    name: 'assist_directives',
    effort: 'medium',
    maxOutputTokens: 16_000,
  })
  return { ...resolveDirectives(problem, parsed), usage }
}
