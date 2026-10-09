import 'server-only'
import { cache } from 'react'
import { type Entitlement, entitlement, isOverLimit, staffLimit } from '@/lib/billing/entitlement'
import { peakWindow, readStaffCountHistory } from '@/lib/billing/history'
import { billableStaffPeak } from '@/lib/billing/peak'
import type { Tables } from '@/types/database'
import { getAuthUser } from '@/utils/auth/current'
import { createClient } from '@/utils/supabase/server'

export type BillingSubscription = Tables<'billing_subscriptions'>

export type BillingOverview = {
  entitlement: Entitlement
  /** 在籍スタッフの上限。null = 上限なし */
  limit: number | null
  /** 全店舗の在籍スタッフの合計（上限はこの数で数える。019 §2.3） */
  activeStaffCount: number
  overLimit: boolean
  /** トライアルを始められるか（一度も使っていない。有料プランでない） */
  trialAvailable: boolean
  /** profiles.trial_end（使用済みなら過去の値） */
  trialEnd: Date | null
  subscription: BillingSubscription | null
  hasCustomer: boolean
}

/**
 * 課金の状態を読む（019 §5.4）。RLS（自分の行だけ）で読む。
 * 上限の判定は DB の門番（`private.staff_limit()`）が正で、ここは画面の表示用に同じ規則（`entitlement`）を当てる
 */
export const getBillingOverview = cache(async (userId: string): Promise<BillingOverview> => {
  const supabase = await createClient()
  const [profile, subscription, staffs] = await Promise.all([
    supabase
      .from('profiles')
      .select('trial_end, max_staffs_count, stripe_customer_id')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('billing_subscriptions').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('staffs')
      .select('id, tenants!inner(owner_id)', { count: 'exact', head: true })
      .eq('tenants.owner_id', userId)
      .is('retired_at', null),
  ])
  if (profile.error) throw profile.error
  if (subscription.error) throw subscription.error
  if (staffs.error) throw staffs.error

  const trialEnd = profile.data?.trial_end ? new Date(profile.data.trial_end) : null
  const value = entitlement({
    subscriptionStatus: subscription.data?.status ?? null,
    trialEnd,
    manualLimit: profile.data?.max_staffs_count ?? null,
    now: new Date(),
  })
  const activeStaffCount = staffs.count ?? 0
  return {
    entitlement: value,
    limit: staffLimit(value),
    activeStaffCount,
    overLimit: isOverLimit(value, activeStaffCount),
    trialAvailable: trialEnd === null && value.kind !== 'subscription',
    trialEnd,
    subscription: subscription.data,
    hasCustomer: Boolean(profile.data?.stripe_customer_id),
  }
})

/**
 * ログイン中の利用者の課金の状態（店舗の帯・シフト表のロック・スタッフ設定の案内）。読めなければ null。
 * どれも無くても画面は使えるので、課金の読み取りの失敗で店舗の画面ごと落とさない（ロックは外れた側に倒れる。
 * スタッフを増やす操作は DB の門番が止める）
 */
export const getCurrentBillingOverview = cache(async (): Promise<BillingOverview | null> => {
  const user = await getAuthUser()
  if (!user) return null
  try {
    return await getBillingOverview(user.id)
  } catch (error) {
    console.error('[billing] 課金の状態を読めませんでした', error)
    return null
  }
})

/** 今の請求期間の最大人数（ここまで）。料金の見込みに使う。トライアル中の部分は数えない */
export async function getPeriodPeak(
  userId: string,
  subscription: Pick<BillingSubscription, 'current_period_start' | 'current_period_end'>,
  trialEnd: Date | null,
  now = new Date()
): Promise<number> {
  const supabase = await createClient()
  const periodStart = new Date(subscription.current_period_start)
  const periodEnd = new Date(subscription.current_period_end)
  const window = peakWindow(periodStart, periodEnd, trialEnd, now)
  const history = await readStaffCountHistory(supabase, userId, window)
  return billableStaffPeak({ history, periodStart, periodEnd, trialEnd, until: now })
}

/** 自分の Stripe の Customer（RLS で自分の行だけ）。同期・ポータルに使い、Client には渡さない */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.stripe_customer_id ?? null
}

/** サブスクリプションの写しを最後に同期した時刻。写しが無ければ null */
export async function getSyncedAt(userId: string): Promise<Date | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('synced_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? new Date(data.synced_at) : null
}
