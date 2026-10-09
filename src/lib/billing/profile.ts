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

/** Stripe の Customer の持ち主（同期で使う）。trialEnd は DB の値のまま（null = トライアル未使用） */
export type BillingOwner = {
  id: string
  email: string | null
  trialEnd: string | null
  stripeCustomerId: string | null
  /** 有料プランの上限人数（null = まだ決めていない。§13.4） */
  staffCap: number | null
}

/** 持ち主を `stripe_customer_id`（1 人に決まる。unique）か利用者の id で引く */
export async function readBillingOwner(
  db: Db,
  by: { customerId: string } | { userId: string }
): Promise<BillingOwner | null> {
  const query = db.from('profiles').select('id, email, trial_end, stripe_customer_id, staff_cap')
  const { data, error } = await (
    'customerId' in by ? query.eq('stripe_customer_id', by.customerId) : query.eq('id', by.userId)
  ).maybeSingle()
  if (error) throw error
  return data
    ? {
        id: data.id,
        email: data.email,
        trialEnd: data.trial_end,
        stripeCustomerId: data.stripe_customer_id,
        staffCap: data.staff_cap,
      }
    : null
}

/** 1 人の全店舗の在籍スタッフ数（上限人数を既定値で埋めるとき。§13.4）。店舗のオーナーで 1 人に絞る */
export async function readActiveStaffCount(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from('staffs')
    .select('id, tenants!inner(owner_id)', { count: 'exact', head: true })
    .eq('tenants.owner_id', userId)
    .is('retired_at', null)
  if (error) throw error
  return count ?? 0
}

/** 1 人の契約の写し（無ければ null） */
export async function readBillingSubscription(
  db: Db,
  userId: string
): Promise<Tables<'billing_subscriptions'> | null> {
  const { data, error } = await db
    .from('billing_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

/** 契約の写しを最後に書いた時刻（写しが無ければ null） */
export async function readSubscriptionSyncedAt(db: Db, userId: string): Promise<Date | null> {
  const { data, error } = await db
    .from('billing_subscriptions')
    .select('synced_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data ? new Date(data.synced_at) : null
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
