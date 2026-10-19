import { z } from 'zod'
import { SHIFT_CYCLES } from '@/lib/calendar/shiftCycle'
import { INDUSTRIES, type Industry } from '@/lib/setup/templates'

/** v1 の Tenant::NAME_MAX_LENGTH。DB の CHECK 制約と同じ */
export const TENANT_NAME_MAX_LENGTH = 20

/**
 * 店舗 id。`z.uuid()` ではなく `z.guid()` を使う。
 * `z.uuid()` は RFC 9562 の version / variant ビットまで検査するため、seed の
 * `22222222-…` のような id を弾いてしまう（005 §3.2）。
 */
export const TENANT_NOT_FOUND_MESSAGE = '店舗が見つかりません'

export const tenantIdSchema = z.guid({ error: TENANT_NOT_FOUND_MESSAGE })

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

/** 業種が「その他」のときの任意の一言（034 §2-10）。DB の `tenants.industry_note` の check と同じ */
export const INDUSTRY_NOTE_MAX_LENGTH = 20

/** 一言。前後の空白を落とし、空欄は null（DB の `char_length between 1 and 20` に '' を届けない） */
export const industryNoteSchema = z
  .string({ error: 'お店の業種を入れ直してください' })
  .trim()
  .max(INDUSTRY_NOTE_MAX_LENGTH, {
    error: `お店の業種は${INDUSTRY_NOTE_MAX_LENGTH}文字以内で入れてください`,
  })
  .transform((v) => (v === '' ? null : v))

/**
 * 業種と一言をそろえる（初期設定と店舗情報で共有。034 §4.2）。
 * 一言は「その他」のときだけ持つ（DB の `tenants_industry_note_other_only`）。空欄は null
 */
export function normalizeIndustry(input: {
  industry: Industry | null
  industryNote: string | null | undefined
}): { industry: Industry | null; industryNote: string | null } {
  const note = input.industryNote?.trim() || null
  return { industry: input.industry, industryNote: input.industry === 'other' ? note : null }
}

/**
 * 店舗情報の更新。`industry` が undefined なら業種と一言に触らない（034 §4.3）:
 * リリース前に開いたタブ（業種を送らない）からの保存を止めず、黙って業種を消さない
 */
export const updateTenantSchema = z.object({
  tenantId: tenantIdSchema,
  name: nameSchema,
  shiftCycle: shiftCycleSchema,
  startOfWeek: startOfWeekSchema,
  industry: z.enum(INDUSTRIES, { error: '業種を選び直してください' }).nullish(),
  industryNote: industryNoteSchema.nullish(),
})

export const deleteTenantSchema = z.object({ tenantId: tenantIdSchema })
