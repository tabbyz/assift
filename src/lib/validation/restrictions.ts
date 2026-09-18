import { z } from 'zod'
import { RESTRICTION_DAYS_MAX, RESTRICTION_DAYS_MIN } from '@/lib/restrictions/kinds'
import { tenantIdSchema } from './tenants'

export const restrictionIdSchema = z.guid({ error: '制約が見つかりません' })

const patternRef = z.guid({ error: '勤務パターンを選択してください' })

const DAYS_RANGE_ERROR = {
  error: `日数は${RESTRICTION_DAYS_MIN}〜${RESTRICTION_DAYS_MAX}で入力してください`,
}

const daysSchema = z
  .int({ error: '日数を入力してください' })
  .min(RESTRICTION_DAYS_MIN, DAYS_RANGE_ERROR)
  .max(RESTRICTION_DAYS_MAX, DAYS_RANGE_ERROR)

/**
 * 種別ごとに使う列が違うので discriminated union にする（006 §3.7）。
 * union 全体に `.extend()` は無いので、tenantId は各 Action の引数スキーマ側で持つ。
 */
export const restrictionInputSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('deny_pattern_pair'),
      pattern1Id: patternRef,
      pattern2Id: patternRef,
    }),
    z.object({ kind: z.literal('max_work_week'), pattern1Id: patternRef, days: daysSchema }),
    z.object({
      kind: z.literal('max_work_consecutive'),
      // v1 と同じくパターン未指定は「勤務日」全体が対象
      pattern1Id: patternRef.nullable(),
      days: daysSchema,
    }),
    z.object({ kind: z.literal('sat_or_sun_dayoff') }),
  ],
  { error: '制約タイプを選択してください' }
)

export type RestrictionInput = z.infer<typeof restrictionInputSchema>

/**
 * フォームから届く未検証の入力。`days` の `''` は NumberInput の空欄（Zod が日本語で弾く）、
 * `pattern1Id` の `null` は Select の未選択。`RestrictionInput` に狭めるのは parse の後。
 */
export type RawRestrictionInput =
  | { kind: 'deny_pattern_pair'; pattern1Id: string | null; pattern2Id: string | null }
  | { kind: 'max_work_week'; pattern1Id: string | null; days: number | '' }
  | { kind: 'max_work_consecutive'; pattern1Id: string | null; days: number | '' }
  | { kind: 'sat_or_sun_dayoff' }

export const createRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  input: restrictionInputSchema,
})

export const updateRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  restrictionId: restrictionIdSchema,
  input: restrictionInputSchema,
})

export const deleteRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  restrictionId: restrictionIdSchema,
})

/** 種別ごとの入力を DB の列に落とす（使わない列は必ず null にする） */
export function toRestrictionColumns(input: RestrictionInput) {
  switch (input.kind) {
    case 'deny_pattern_pair':
      return {
        kind: input.kind,
        days: null,
        pattern1_id: input.pattern1Id,
        pattern2_id: input.pattern2Id,
      }
    case 'max_work_week':
      return {
        kind: input.kind,
        days: input.days,
        pattern1_id: input.pattern1Id,
        pattern2_id: null,
      }
    case 'max_work_consecutive':
      return {
        kind: input.kind,
        days: input.days,
        pattern1_id: input.pattern1Id,
        pattern2_id: null,
      }
    case 'sat_or_sun_dayoff':
      return { kind: input.kind, days: null, pattern1_id: null, pattern2_id: null }
  }
}
