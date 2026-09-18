import { z } from 'zod'
import { DAY_KEYS } from '@/lib/calendar/weekdays'
import { tenantIdSchema } from './tenants'

/** v1 の Staff::NAME_MAX_LENGTH。DB の CHECK 制約と同じ */
export const STAFF_NAME_MAX_LENGTH = 10

/** v1 の max_work_week（0..7）。DB の CHECK 制約と同じ */
export const MAX_WORK_WEEK_MIN = 0
export const MAX_WORK_WEEK_MAX = 7

export const staffIdSchema = z.guid({ error: 'スタッフが見つかりません' })

export const staffNameSchema = z
  .string({ error: 'スタッフ名を入力してください' })
  .trim()
  .min(1, { error: 'スタッフ名を入力してください' })
  .max(STAFF_NAME_MAX_LENGTH, {
    error: `スタッフ名は${STAFF_NAME_MAX_LENGTH}文字以下で入力してください`,
  })

const WDAY_ERROR = { error: '勤務できる曜日が正しくありません' }

/** leaf に `{ error }` を付ける理由は 006 §3.12 */
export const staffInputSchema = z.object({
  name: staffNameSchema,
  availableWdays: z
    .array(z.int(WDAY_ERROR).min(0, WDAY_ERROR).max(6, WDAY_ERROR), WDAY_ERROR)
    .max(7, WDAY_ERROR)
    .refine((v) => new Set(v).size === v.length, WDAY_ERROR),
  maxWorkWeek: z
    .int({ error: '週の最大勤務日数を入力してください' })
    .min(MAX_WORK_WEEK_MIN, {
      error: `週の最大勤務日数は${MAX_WORK_WEEK_MIN}〜${MAX_WORK_WEEK_MAX}で入力してください`,
    })
    .max(MAX_WORK_WEEK_MAX, {
      error: `週の最大勤務日数は${MAX_WORK_WEEK_MIN}〜${MAX_WORK_WEEK_MAX}で入力してください`,
    }),
  availablePatternIds: z
    .array(z.guid({ error: '選択可能な勤務パターンが正しくありません' }), {
      error: '選択可能な勤務パターンが正しくありません',
    })
    .refine((v) => new Set(v).size === v.length, {
      error: '選択可能な勤務パターンが正しくありません',
    }),
  defaultPatterns: z.partialRecord(
    z.enum(DAY_KEYS),
    z.guid({ error: 'デフォルトの勤務パターンが正しくありません' })
  ),
})

export const createStaffSchema = staffInputSchema.extend({ tenantId: tenantIdSchema })

export const updateStaffSchema = createStaffSchema.extend({ staffId: staffIdSchema })

/** 退職 / 復帰 / 削除。id だけを受け取り、所有は RLS と tenant_id の重ねがけで確かめる */
export const staffRefSchema = z.object({
  tenantId: tenantIdSchema,
  staffId: staffIdSchema,
})
