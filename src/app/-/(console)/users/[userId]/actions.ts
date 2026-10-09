'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { createAdminClient } from '@/lib/admin/client'
import { ADMIN_ROOT } from '@/lib/admin/paths'
import { canEditTrial, canEndTrialNow } from '@/lib/admin/trial'
import { readBillingProfile } from '@/lib/billing/profile'
import { trialEndForLastDay } from '@/lib/billing/trial'
import {
  adminUserSchema,
  setManualLimitSchema,
  setTrialLastDaySchema,
} from '@/lib/validation/admin'
import type { TablesUpdate } from '@/types/database'

/**
 * 管理画面の操作（020 §7）。すべて profiles の 1 列を service_role で更新する。
 * 利用者の画面は DB を読み直すので、次の描画から反映される。
 * 確認（ホスト + is_admin）は最初の createAdminClient() が行う（入力の検証より先に断る）
 */

const USER_NOT_FOUND = 'ユーザーが見つかりません'
const SUBSCRIBED = '有料プランの契約が残っているため、トライアルは変更できません'

type AdminDb = Awaited<ReturnType<typeof createAdminClient>>

/** トライアルを変えてよいか（請求に戻りうる契約があれば変えない。trial_end は請求の区間の始まりに使われる） */
async function readEditableTrial(db: AdminDb, userId: string) {
  const [profile, subscription] = await Promise.all([
    readBillingProfile(db, userId),
    db.from('billing_subscriptions').select('status').eq('user_id', userId).maybeSingle(),
  ])
  if (subscription.error) throw subscription.error
  if (!profile) fail(USER_NOT_FOUND)
  const status = subscription.data?.status ?? null
  // 判定と更新の間に申し込まれる競合は、管理者 1 名なので受け入れる（020 §7）
  if (!canEditTrial(status)) fail(SUBSCRIBED)
  return { status, trialEnd: profile.trialEnd }
}

async function updateProfile(db: AdminDb, userId: string, values: TablesUpdate<'profiles'>) {
  const { data, error } = await db.from('profiles').update(values).eq('id', userId).select('id')
  if (error) throw error
  if (data.length === 0) fail(USER_NOT_FOUND)
  // 一覧のトライアルの最終日・契約も古くなるので管理画面全体
  revalidatePath(ADMIN_ROOT, 'layout')
}

export async function setTrialLastDay(input: {
  userId: string
  lastDay: string
}): Promise<ActionResult> {
  return runAction(async () => {
    const db = await createAdminClient()
    const { userId, lastDay } = setTrialLastDaySchema.parse(input)
    await readEditableTrial(db, userId)
    await updateProfile(db, userId, { trial_end: trialEndForLastDay(lastDay).toISOString() })
  })
}

export async function endTrialNow(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const db = await createAdminClient()
    const { userId } = adminUserSchema.parse(input)
    const { status, trialEnd } = await readEditableTrial(db, userId)
    const now = new Date()
    if (!canEndTrialNow(status, trialEnd, now)) fail('トライアル中ではありません')
    await updateProfile(db, userId, { trial_end: now.toISOString() })
  })
}

export async function resetTrial(input: { userId: string }): Promise<ActionResult> {
  return runAction(async () => {
    const db = await createAdminClient()
    const { userId } = adminUserSchema.parse(input)
    await readEditableTrial(db, userId)
    await updateProfile(db, userId, { trial_end: null })
  })
}

export async function setManualLimit(input: {
  userId: string
  limit: number | null
}): Promise<ActionResult> {
  return runAction(async () => {
    const db = await createAdminClient()
    const { userId, limit } = setManualLimitSchema.parse(input)
    await updateProfile(db, userId, { max_staffs_count: limit })
  })
}
