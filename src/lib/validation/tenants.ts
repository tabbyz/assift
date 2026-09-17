import { z } from 'zod'
import { SHIFT_CYCLES } from '@/lib/calendar/shiftCycle'

/** v1 の Tenant::NAME_MAX_LENGTH。DB の CHECK 制約と同じ */
export const TENANT_NAME_MAX_LENGTH = 20

/**
 * 店舗 id。`z.uuid()` ではなく `z.guid()` を使う。
 * `z.uuid()` は RFC 9562 の version / variant ビットまで検査するため、seed の
 * `22222222-…` のような id を弾いてしまう（005 §3.2）。
 */
export const tenantIdSchema = z.guid({ error: '店舗が見つかりません' })

const nameSchema = z
  .string()
  .trim()
  .min(1, { error: '店舗名を入力してください' })
  .max(TENANT_NAME_MAX_LENGTH, {
    error: `店舗名は${TENANT_NAME_MAX_LENGTH}文字以下で入力してください`,
  })

const shiftCycleSchema = z.enum(SHIFT_CYCLES, { error: 'シフト表の作成周期を選択してください' })

const startOfWeekSchema = z
  .number()
  .int()
  .min(0, { error: 'カレンダーの週の始まりを選択してください' })
  .max(6, { error: 'カレンダーの週の始まりを選択してください' })

export const createTenantSchema = z.object({
  name: nameSchema,
  shiftCycle: shiftCycleSchema,
})

export const updateTenantSchema = z.object({
  tenantId: tenantIdSchema,
  name: nameSchema,
  shiftCycle: shiftCycleSchema,
  startOfWeek: startOfWeekSchema,
})

export const deleteTenantSchema = z.object({ tenantId: tenantIdSchema })
