import { z } from 'zod'
import { tenantIdSchema } from './tenants'

/** v1 の Pattern::NAME_MAX_LENGTH / DESCRIPTION_MAX_LENGTH。DB の CHECK 制約と同じ */
export const PATTERN_NAME_MAX_LENGTH = 6
export const PATTERN_DESCRIPTION_MAX_LENGTH = 10

export const patternNameSchema = z
  .string()
  .trim()
  .min(1, { error: '勤務パターン名を入力してください' })
  .max(PATTERN_NAME_MAX_LENGTH, {
    error: `勤務パターン名は${PATTERN_NAME_MAX_LENGTH}文字以下で入力してください`,
  })

/** 005 は名前だけ。色・種別・ペア・デフォルト必要人数は 006 でここに足す */
export const createPatternSchema = z.object({
  tenantId: tenantIdSchema,
  name: patternNameSchema,
})
