import { z } from 'zod'
import { tenantIdSchema } from './tenants'

/** v1 の Staff::NAME_MAX_LENGTH。DB の CHECK 制約と同じ */
export const STAFF_NAME_MAX_LENGTH = 10

export const staffNameSchema = z
  .string()
  .trim()
  .min(1, { error: 'スタッフ名を入力してください' })
  .max(STAFF_NAME_MAX_LENGTH, {
    error: `スタッフ名は${STAFF_NAME_MAX_LENGTH}文字以下で入力してください`,
  })

/** 005 は名前だけ。勤務曜日・週上限・選択可能パターン・デフォルトは 006 でここに足す */
export const createStaffSchema = z.object({
  tenantId: tenantIdSchema,
  name: staffNameSchema,
})
