import { z } from 'zod'
import { tenantIdSchema } from './tenants'

/** 1 店舗の 1 テーブルに現実的に並ぶ上限（v1 の最大店舗でも 200 行には遠い） */
export const REORDER_MAX_ITEMS = 200

const ORDER_ERROR = { error: '並び順が正しくありません' }

/**
 * 並べ替え（`reorder_positions` RPC）の入力。3 ルート（staffs / patterns / restrictions）で共有する。
 * どのテーブルかは Server Action が定数で決めるので、ここには含めない（006 §5.1）。
 */
export const reorderSchema = z.object({
  tenantId: tenantIdSchema,
  ids: z
    .array(z.guid(ORDER_ERROR), ORDER_ERROR)
    .min(1, ORDER_ERROR)
    .max(REORDER_MAX_ITEMS, ORDER_ERROR)
    .refine((ids) => new Set(ids).size === ids.length, ORDER_ERROR),
})
