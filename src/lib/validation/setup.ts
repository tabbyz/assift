import { z } from 'zod'
import { SHIFT_CYCLES, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { SETUP_STAFFS_MAX } from '@/lib/setup/parseStaffNames'
import { patternInputSchema } from './patterns'
import { staffNameSchema } from './staffs'
import { TENANT_NAME_MAX_LENGTH, tenantIdSchema } from './tenants'

/** 週の始まりを聞く周期（014 §3.4）。1ヶ月・半月の表は見た目が変わらないので聞かない */
export function asksStartOfWeek(cycle: ShiftCycle): boolean {
  return cycle === 'week' || cycle === 'two_week'
}

/** 1ヶ月・半月の店の週の始まり（日曜。労基法の「1 週間」も、就業規則に定めがなければ日曜〜土曜） */
export const DEFAULT_START_OF_WEEK = 0

const START_OF_WEEK_ERROR = '何曜日から始まるか選んでください'

/**
 * ステップ 1（店名・作成周期・週の始まり）。
 * 週の始まりは週・2 週のときだけ必須。1ヶ月・半月では送られても日曜（0）にする:
 * 2 週・月曜 → 1ヶ月と戻したときに月曜が黙って残ると、自動作成の週の区切りだけが月曜になる（014 §5.5）
 */
const setupTenantFields = z
  .object({
    name: z
      .string({ error: 'お店の名前を入れてください' })
      .trim()
      .min(1, { error: 'お店の名前を入れてください' })
      .max(TENANT_NAME_MAX_LENGTH, {
        error: `お店の名前は${TENANT_NAME_MAX_LENGTH}文字以内で入れてください`,
      }),
    shiftCycle: z.enum(SHIFT_CYCLES, { error: 'シフト表を何日分ずつ作るか選んでください' }),
    startOfWeek: z
      .int({ error: START_OF_WEEK_ERROR })
      .min(0, { error: START_OF_WEEK_ERROR })
      .max(6, { error: START_OF_WEEK_ERROR })
      .nullable(),
  })
  .refine((v) => !asksStartOfWeek(v.shiftCycle) || v.startOfWeek !== null, {
    error: START_OF_WEEK_ERROR,
    path: ['startOfWeek'],
  })
  .transform((v) => ({
    ...v,
    startOfWeek: asksStartOfWeek(v.shiftCycle) ? v.startOfWeek! : DEFAULT_START_OF_WEEK,
  }))

export const createSetupTenantSchema = setupTenantFields

export const updateSetupTenantSchema = z.object({ tenantId: tenantIdSchema }).and(setupTenantFields)

/** 初期設定で 1 回に保存できる勤務の数（テンプレートは多くて 7 件） */
export const SETUP_PATTERNS_MAX = 20

const NO_WORKDAY_ERROR = '働く日の勤務を 1 つ以上残してください'

const setupPatternSchema = patternInputSchema
  .pick({ name: true, description: true, colorHex: true, kind: true })
  .extend({
    key: z.string({ error: '勤務が正しくありません' }).min(1, { error: '勤務が正しくありません' }),
  })

/** ステップ 2（勤務の保存）。ペアは `selectedPatterns` が両方残っているときだけ送る */
export const saveSetupPatternsSchema = z
  .object({
    tenantId: tenantIdSchema,
    patterns: z
      .array(setupPatternSchema, { error: NO_WORKDAY_ERROR })
      .min(1, { error: NO_WORKDAY_ERROR })
      .max(SETUP_PATTERNS_MAX, { error: `勤務は${SETUP_PATTERNS_MAX}個までです` }),
    pair: z
      .object({
        fromKey: z.string({ error: '明けの設定が正しくありません' }),
        toKey: z.string({ error: '明けの設定が正しくありません' }),
      })
      .nullable(),
  })
  .refine((v) => v.patterns.some((row) => row.kind === 'workday'), {
    error: NO_WORKDAY_ERROR,
    path: ['patterns'],
  })
  .refine((v) => new Set(v.patterns.map((row) => row.key)).size === v.patterns.length, {
    error: '勤務が正しくありません',
    path: ['patterns'],
  })
  .refine(
    (v) => {
      if (!v.pair) return true
      const keys = new Set(v.patterns.map((row) => row.key))
      return v.pair.fromKey !== v.pair.toKey && keys.has(v.pair.fromKey) && keys.has(v.pair.toKey)
    },
    { error: '明けの設定が正しくありません', path: ['pair'] }
  )

/** ステップ 3（スタッフを作って完了）。分け方と 10 文字の数え方は `parseStaffNames` と同じ */
export const completeSetupSchema = z.object({
  tenantId: tenantIdSchema,
  names: z
    .array(staffNameSchema, { error: '名前を 1 人以上入れてください' })
    .min(1, { error: '名前を 1 人以上入れてください' })
    .max(SETUP_STAFFS_MAX, { error: `${SETUP_STAFFS_MAX}人ずつ入れてください` }),
})
