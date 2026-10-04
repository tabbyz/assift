import { z } from 'zod'
import {
  hasStrengthChoice,
  normalizeWdays,
  PREFER_DAYOFF_WDAYS_MAX,
  RESTRICTION_DAYS_MAX,
  RESTRICTION_DAYS_MIN,
  RESTRICTION_WEEKEND_DAYS_MAX,
} from '@/lib/restrictions/kinds'
import { tenantIdSchema } from './tenants'

export const restrictionIdSchema = z.guid({ error: '制約が見つかりません' })

/** 対象。null = 店舗全体（013 §3.2） */
const staffIdSchema = z.guid({ error: 'スタッフを選択してください' }).nullable()

/** 強さ。`true` = 必須 / `false` = なるべく */
const hardSchema = z.boolean({ error: '強さを選択してください' })

const WDAYS_ERROR = { error: '曜日を選択してください' }

const wdaysSchema = z
  .array(z.int(WDAYS_ERROR).min(0, WDAYS_ERROR).max(6, WDAYS_ERROR), WDAYS_ERROR)
  .min(1, WDAYS_ERROR)
  .max(PREFER_DAYOFF_WDAYS_MAX, { error: 'すべての曜日は選べません' })
  .refine((wdays) => new Set(wdays).size === wdays.length, WDAYS_ERROR)
  // 範囲と重複は上で弾いたので、ここでは並べるだけ（エンジン・画面の文言と同じ並び）
  .transform(normalizeWdays)

const patternRef = z.guid({ error: '勤務パターンを選択してください' })

function daysSchemaUpTo(max: number) {
  const rangeError = { error: `日数は${RESTRICTION_DAYS_MIN}〜${max}で入力してください` }
  return z
    .int({ error: '日数を入力してください' })
    .min(RESTRICTION_DAYS_MIN, rangeError)
    .max(max, rangeError)
}

const daysSchema = daysSchemaUpTo(RESTRICTION_DAYS_MAX)
/** 土日祝の上限は表示期間で数えるので広い（013 §9.6） */
const weekendDaysSchema = daysSchemaUpTo(RESTRICTION_WEEKEND_DAYS_MAX)

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
    z.object({ kind: z.literal('min_work_week'), days: daysSchema }),
    z.object({ kind: z.literal('max_weekend_days'), days: weekendDaysSchema }),
    z.object({ kind: z.literal('prefer_dayoff_wdays'), wdays: wdaysSchema }),
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
  | { kind: 'min_work_week'; days: number | '' }
  | { kind: 'max_weekend_days'; days: number | '' }
  | { kind: 'prefer_dayoff_wdays'; wdays: number[] }

/**
 * 対象と強さは種別に依らないので、判別共用体の外（Action の引数）に置く。
 * union 全体に `.extend()` が無いので、tenantId と同じ扱い（006 §3.7）
 */
export const createRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  staffId: staffIdSchema,
  hard: hardSchema,
  input: restrictionInputSchema,
})

export const updateRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  restrictionId: restrictionIdSchema,
  staffId: staffIdSchema,
  hard: hardSchema,
  input: restrictionInputSchema,
})

export const deleteRestrictionSchema = z.object({
  tenantId: tenantIdSchema,
  restrictionId: restrictionIdSchema,
})

/** 強さを選べない種別（なるべく休みの曜日）は画面の値を信じず、なるべくに固定する（DB の CHECK と同じ） */
export function resolveHard(input: Pick<RestrictionInput, 'kind'>, hard: boolean): boolean {
  return hasStrengthChoice(input.kind) ? hard : false
}

/** 種別ごとの入力を DB の列に落とす（使わない列は必ず null にする） */
export function toRestrictionColumns(input: RestrictionInput) {
  switch (input.kind) {
    case 'deny_pattern_pair':
      return {
        kind: input.kind,
        days: null,
        pattern1_id: input.pattern1Id,
        pattern2_id: input.pattern2Id,
        wdays: null,
      }
    case 'max_work_week':
      return {
        kind: input.kind,
        days: input.days,
        pattern1_id: input.pattern1Id,
        pattern2_id: null,
        wdays: null,
      }
    case 'max_work_consecutive':
      return {
        kind: input.kind,
        days: input.days,
        pattern1_id: input.pattern1Id,
        pattern2_id: null,
        wdays: null,
      }
    case 'sat_or_sun_dayoff':
      return { kind: input.kind, days: null, pattern1_id: null, pattern2_id: null, wdays: null }
    case 'min_work_week':
    case 'max_weekend_days':
      return {
        kind: input.kind,
        days: input.days,
        pattern1_id: null,
        pattern2_id: null,
        wdays: null,
      }
    case 'prefer_dayoff_wdays':
      return {
        kind: input.kind,
        days: null,
        pattern1_id: null,
        pattern2_id: null,
        wdays: input.wdays,
      }
  }
}
