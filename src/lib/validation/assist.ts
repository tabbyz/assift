import { z } from 'zod'
import { dateStringSchema } from './date'
import { tenantIdSchema } from './tenants'

/**
 * 自動アサイン（012）。上限はモーダル・`startAssist`・DB の check 制約（`assist_runs.instructions` /
 * `tenants.assist_notes`）で同じ値を使う（§5.2）。
 */
export const ASSIST_INSTRUCTIONS_MAX_LENGTH = 500

export const ASSIST_RUN_NOT_FOUND_MESSAGE = '自動アサインの実行が見つかりません'
export const ASSIST_UNAVAILABLE_MESSAGE = '現在利用できません'
export const ASSIST_RUNNING_MESSAGE = '実行中の自動アサインがあります'
export const ASSIST_BUDGET_MESSAGE = 'AI の利用上限に達しました'
export const ASSIST_LEVER_NOT_FOUND_MESSAGE =
  'この提案は使えなくなりました。画面を読み直してください'

export const assistRunIdSchema = z.guid({ error: ASSIST_RUN_NOT_FOUND_MESSAGE })

export const assistInstructionsSchema = z
  .string({ error: 'AI への指示が正しくありません' })
  .trim()
  .max(ASSIST_INSTRUCTIONS_MAX_LENGTH, {
    error: `AI への指示は${ASSIST_INSTRUCTIONS_MAX_LENGTH}文字以内で入力してください`,
  })

/**
 * 実行の開始。期間は `start` だけを受け、サーバーが `dateRange()` で組み直す（エクスポートと同じ。`end` を受けない）。
 * `retryOfRunId` は「別の案を作る」の前の run（§3.10）。
 */
export const startAssistSchema = z.object({
  tenantId: tenantIdSchema,
  start: dateStringSchema,
  instructions: assistInstructionsSchema,
  saveNotes: z.boolean({ error: '既定として保存するかの指定が正しくありません' }),
  retryOfRunId: assistRunIdSchema.nullish(),
})

/** 元に戻す / 結果を閉じる */
export const assistRunSchema = z.object({
  tenantId: tenantIdSchema,
  runId: assistRunIdSchema,
})

/** 効く一手の実行（012 §11.3）。一手は run の結果の添字で指す（上位 2 件） */
export const applyAssistLeverSchema = assistRunSchema.extend({
  leverIndex: z
    .number({ error: ASSIST_LEVER_NOT_FOUND_MESSAGE })
    .int({ error: ASSIST_LEVER_NOT_FOUND_MESSAGE })
    .min(0, { error: ASSIST_LEVER_NOT_FOUND_MESSAGE })
    .max(9, { error: ASSIST_LEVER_NOT_FOUND_MESSAGE }),
})
