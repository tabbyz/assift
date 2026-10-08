import 'server-only'
import { pageAll } from '@/lib/queries/pageAll'
import type { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import type { Tables } from '@/types/database'
import { ENTITLED_STATUSES } from './entitlement'

/**
 * 課金の service_role の読み取り（019 §5.6・§5.7）。Webhook / cron / 退会 / 申し込みが共有する。
 * RLS を通らないので、1 人分の読み取りは必ず `.eq('id', …)` で絞る（`publicShare.ts` と同じ規律）。ここ以外に書き写さない
 */

type Db = ReturnType<typeof createPrivilegedClient>

export type BillingProfile = { stripeCustomerId: string | null; trialEnd: Date | null }

/** 1 人分の `stripe_customer_id` と `trial_end`。利用者がいなければ null */
export async function readBillingProfile(db: Db, userId: string): Promise<BillingProfile | null> {
  const { data, error } = await db
    .from('profiles')
    .select('stripe_customer_id, trial_end')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    stripeCustomerId: data.stripe_customer_id,
    trialEnd: data.trial_end ? new Date(data.trial_end) : null,
  }
}

/**
 * 有効な（上限なしで使える）契約の写しを全件読む。有料の利用者が 1000 人を超えると `max_rows` で黙って切られ、
 * 切られた人の人数が送られずに無料で請求されるので、`pageAll()` を通す
 */
export async function listEntitledSubscriptions(
  db: Db
): Promise<Tables<'billing_subscriptions'>[]> {
  return pageAll((from, to, withCount) =>
    db
      .from('billing_subscriptions')
      .select('*', withCount ? { count: 'exact' } : undefined)
      .in('status', [...ENTITLED_STATUSES])
      .order('user_id', { ascending: true })
      .range(from, to)
  )
}
