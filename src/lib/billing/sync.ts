import 'server-only'
import Stripe from 'stripe'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { CUSTOMER_USER_ID_KEY, LEGACY_PRICE_ID } from './constants'
import { isEntitledStatus } from './entitlement'
import { listEntitledSubscriptions, readBillingProfile } from './profile'
import { getStripe, resolvePriceId } from './stripe'
import { chooseSubscription, subscriptionRow } from './subscriptionRow'

/**
 * Stripe → `billing_subscriptions` の同期（019 §5.6・§5.7）。Stripe が正で、DB はその写し。
 *
 * Webhook はイベントの中身を使わず、Customer の Subscription を Stripe から取り直してここに渡す（順不同・重複に強い）。
 * 書き込みは service_role。中のクエリはすべて 1 人（`user_id` / `id` / `stripe_customer_id`）に絞る。
 */

type Db = ReturnType<typeof createPrivilegedClient>

const EXPAND = ['data.schedule', 'data.discounts']

const isMissingPrice = (error: unknown) =>
  error instanceof Stripe.errors.StripeInvalidRequestError &&
  error.code === 'resource_missing' &&
  error.param === 'price'

type Owner = { id: string; email: string | null; trialEnd: string | null }

/** Customer → 利用者。`profiles.stripe_customer_id` で引き、無ければ v2 が付けた metadata（v1 の `user_id` は見ない） */
async function findOwner(
  db: Db,
  customer: Stripe.Customer | Stripe.DeletedCustomer
): Promise<Owner | null> {
  const { data, error } = await db
    .from('profiles')
    .select('id, email, trial_end')
    .eq('stripe_customer_id', customer.id)
    .maybeSingle()
  if (error) throw error
  if (data) return { id: data.id, email: data.email, trialEnd: data.trial_end }
  if (customer.deleted) return null

  const userId = customer.metadata?.[CUSTOMER_USER_ID_KEY]
  if (!userId) return null
  const byId = await db
    .from('profiles')
    .select('id, email, trial_end')
    .eq('id', userId)
    .maybeSingle()
  if (byId.error) throw byId.error
  return byId.data
    ? { id: byId.data.id, email: byId.data.email, trialEnd: byId.data.trial_end }
    : null
}

/**
 * 1 人分の Subscription を写す。有効な契約が 2 件以上あれば、新しいほうを即時解約する（019 §5.5）。
 * 申し込みでトライアルを使ったとみなす（`trial_end` が null なら Subscription の開始時刻。§7.1）。
 * Customer のメールが profiles と違えば Customer 側を直す（§5.6）
 */
async function applySubscriptions(
  db: Db,
  stripe: Stripe,
  owner: Owner,
  customer: Stripe.Customer,
  subscriptions: Stripe.Subscription[],
  now: Date
): Promise<void> {
  const { keep, duplicates } = chooseSubscription(subscriptions)

  for (const duplicate of duplicates) {
    console.warn(
      `[billing] 二重の契約を解約します (user: ${owner.id}, subscription: ${duplicate.id})`
    )
    await stripe.subscriptions.cancel(duplicate.id)
  }

  if (!keep) {
    const { error } = await db.from('billing_subscriptions').delete().eq('user_id', owner.id)
    if (error) throw error
  } else {
    const { error } = await db
      .from('billing_subscriptions')
      .upsert(subscriptionRow(owner.id, keep, now), { onConflict: 'user_id' })
    if (error) throw error

    if (isEntitledStatus(keep.status) && owner.trialEnd === null) {
      const { error: trialError } = await db
        .from('profiles')
        .update({ trial_end: new Date(keep.start_date * 1000).toISOString() })
        .eq('id', owner.id)
        .is('trial_end', null)
      if (trialError) throw trialError
    }
  }

  if (owner.email && customer.email !== owner.email) {
    await stripe.customers.update(customer.id, { email: owner.email })
  }
}

/** 1 人分を Stripe から取り直して写す。Webhook・画面の描画・Checkout から戻ったときに呼ぶ */
export async function syncCustomer(
  customerId: string,
  now = new Date()
): Promise<{ userId: string } | null> {
  const stripe = getStripe()
  const db = createPrivilegedClient()

  const customer = await stripe.customers.retrieve(customerId)
  const owner = await findOwner(db, customer)
  // 退会済み（利用者がいない）なら何もしない。Subscription は期間の終わりで終わる（§5.8）
  if (!owner || customer.deleted) return null

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
    expand: EXPAND,
  })
  await applySubscriptions(db, stripe, owner, customer, subscriptions.data, now)
  return { userId: owner.id }
}

/**
 * 全員をまとめて同期する（定期実行・カットオーバー。§5.7）。1 人ずつ取ると Stripe への呼び出しが数百回になるので、
 * 料金の price ごとの一覧を 100 件ずつ取る。既定の一覧には解約済みが出ないので、
 * DB で有効扱いなのに一覧に出てこなかった契約は 1 件ずつ取り直す（解約の Webhook を落としても上限なしで残らないように）
 */
export async function syncAllSubscriptions(
  now = new Date()
): Promise<{ synced: number; failed: number }> {
  const stripe = getStripe()
  const db = createPrivilegedClient()
  const priceIds = [await resolvePriceId(stripe), LEGACY_PRICE_ID]

  const byCustomer = new Map<
    string,
    { customer: Stripe.Customer; subscriptions: Stripe.Subscription[] }
  >()
  for (const price of priceIds) {
    const pages = stripe.subscriptions.list({
      price,
      limit: 100,
      expand: [...EXPAND, 'data.customer'],
    })
    try {
      for await (const subscription of pages) {
        const customer = subscription.customer
        if (typeof customer === 'string' || customer.deleted) continue
        const entry = byCustomer.get(customer.id) ?? { customer, subscriptions: [] }
        entry.subscriptions.push(subscription)
        byCustomer.set(customer.id, entry)
      }
    } catch (error) {
      // v1 の price が無いアカウント（サンドボックス・旧料金をやめたあと）でも、新料金の同期と人数の送信を止めない
      if (price !== LEGACY_PRICE_ID || !isMissingPrice(error)) throw error
    }
  }

  let synced = 0
  let failed = 0
  const seen = new Set<string>()
  for (const { customer, subscriptions } of byCustomer.values()) {
    try {
      const owner = await findOwner(db, customer)
      if (!owner) continue
      await applySubscriptions(db, stripe, owner, customer, subscriptions, now)
      subscriptions.forEach((subscription) => seen.add(subscription.id))
      synced += 1
    } catch (error) {
      failed += 1
      console.error(`[billing] 同期に失敗しました (customer: ${customer.id})`, error)
    }
  }

  // 有効扱いなのに一覧に出てこなかった（解約済みなど）契約を 1 件ずつ取り直す
  for (const row of await listEntitledSubscriptions(db)) {
    if (seen.has(row.stripe_subscription_id)) continue
    try {
      const profile = await readBillingProfile(db, row.user_id)
      if (profile?.stripeCustomerId) await syncCustomer(profile.stripeCustomerId, now)
      synced += 1
    } catch (syncError) {
      failed += 1
      console.error(`[billing] 同期に失敗しました (user: ${row.user_id})`, syncError)
    }
  }

  return { synced, failed }
}
