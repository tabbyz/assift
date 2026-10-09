import { z } from 'zod'
import { isDateString } from '@/lib/calendar/dateString'
import { STAFF_CAP_MAX, STAFF_CAP_MIN } from './billing'

/** 管理画面の操作（020 §7）の入力 */

const userIdSchema = z.guid({ error: 'ユーザーが見つかりません' })

export const adminUserSchema = z.object({ userId: userIdSchema })

/** トライアルの最終日の上限。桁の打ち間違いを止める（9999-12-31 は翌日が 5 桁の年になり Date にできない） */
export const TRIAL_LAST_DAY_MAX = '2099-12-31'

export const setTrialLastDaySchema = z.object({
  userId: userIdSchema,
  lastDay: z
    .string({ error: '最終日を入力してください' })
    .refine(isDateString, { error: '最終日の日付が正しくありません' })
    .refine((v) => v <= TRIAL_LAST_DAY_MAX, { error: '最終日は2099年12月31日までにしてください' }),
})

const MANUAL_LIMIT_RANGE_ERROR = `個別契約の上限は${STAFF_CAP_MIN}〜${STAFF_CAP_MAX}人で入力してください`

/**
 * 個別契約の上限（`profiles.max_staffs_count`）。10 以下は効かない（無料の上限と同じ）ので受けない。上限は有料プランの上限人数と同じ。
 * null = 通常に戻す（画面では「通常に戻す」ボタンで送り、空欄は送らない）
 */
export const manualLimitSchema = z
  .int({ error: '個別契約の上限を入力してください' })
  .min(STAFF_CAP_MIN, { error: MANUAL_LIMIT_RANGE_ERROR })
  .max(STAFF_CAP_MAX, { error: MANUAL_LIMIT_RANGE_ERROR })

export const setManualLimitSchema = z.object({
  userId: userIdSchema,
  limit: manualLimitSchema.nullable(),
})
