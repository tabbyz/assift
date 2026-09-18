import { z } from 'zod'
import { PATTERN_KINDS } from '@/lib/patterns/kinds'
import { requiredNumsSchema } from '@/lib/patterns/requiredNums'
import { tenantIdSchema } from './tenants'

/** v1 の Pattern::NAME_MAX_LENGTH / DESCRIPTION_MAX_LENGTH。DB の CHECK 制約と同じ */
export const PATTERN_NAME_MAX_LENGTH = 6
export const PATTERN_DESCRIPTION_MAX_LENGTH = 10

export const patternIdSchema = z.guid({ error: '勤務パターンが見つかりません' })

export const patternNameSchema = z
  .string({ error: '勤務パターン名を入力してください' })
  .trim()
  .min(1, { error: '勤務パターン名を入力してください' })
  .max(PATTERN_NAME_MAX_LENGTH, {
    error: `勤務パターン名は${PATTERN_NAME_MAX_LENGTH}文字以下で入力してください`,
  })

/**
 * 勤務パターンの入力。
 *
 * leaf に必ず `{ error }` を付ける: Select の未選択（null）や NumberInput の空欄（''）が届くと、
 * 既定のままでは Zod の英語メッセージがそのまま画面に出る（006 §3.12）。
 */
export const patternInputSchema = z.object({
  name: patternNameSchema,
  description: z
    .string({ error: '説明の形式が正しくありません' })
    .trim()
    .max(PATTERN_DESCRIPTION_MAX_LENGTH, {
      error: `説明は${PATTERN_DESCRIPTION_MAX_LENGTH}文字以下で入力してください`,
    }),
  /**
   * DB の CHECK（`color_hex ~ '^#[0-9A-Fa-f]{6}$'`）と同じ条件にする。
   * UI が出すのは 20 色だけだが、**20 色に限定すると v1 から移行したパレット外の色を持つ行が
   * 編集画面で保存できなくなる**（スウォッチが未選択になり「カラーを選択してください」で止まる）。
   * 制約が参照するパターンを候補に残すのと同じ理由（006 §10.7 の 1 / §10.9）。
   */
  colorHex: z
    .string({ error: 'カラーを選択してください' })
    .regex(/^#[0-9A-Fa-f]{6}$/, { error: 'カラーを選択してください' }),
  kind: z.enum(PATTERN_KINDS, { error: 'パターン区分を選択してください' }),
  pairPatternId: z.guid({ error: 'ペア勤務パターンが正しくありません' }).nullable(),
  defaultRequiredNums: requiredNumsSchema,
})

export const createPatternSchema = patternInputSchema.extend({ tenantId: tenantIdSchema })

export const updatePatternSchema = createPatternSchema
  .extend({ patternId: patternIdSchema })
  // 自分自身をペアにすると「翌日も同じパターン」で無限に連鎖する。UI でも選択肢から外す（006 §3.8）
  .refine((v) => v.pairPatternId !== v.patternId, {
    error: 'ペア勤務パターンに自分自身は選べません',
    path: ['pairPatternId'],
  })

export const deletePatternSchema = z.object({
  tenantId: tenantIdSchema,
  patternId: patternIdSchema,
})
