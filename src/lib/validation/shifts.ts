import { z } from 'zod'
import { patternIdSchema } from './patterns'
import { staffIdSchema } from './staffs'
import { dateStringSchema } from './date'
import { tenantIdSchema } from './tenants'

/**
 * セルのアサイン（007 §5.5）。`patternId` が null なら「空」（アサイン解除）。
 * 選択可能なパターンかは検査しない（v1 と同じ。テナント境界は RLS と RPC が見る）。
 */
export const assignShiftSchema = z.object({
  tenantId: tenantIdSchema,
  staffId: staffIdSchema,
  date: dateStringSchema,
  patternId: patternIdSchema.nullable(),
  fixed: z.boolean({ error: '下書き / 確定の指定が正しくありません' }),
})
