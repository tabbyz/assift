/**
 * Stripe のサンドボックスでの確認（019 §9.4-4）の道具。本番コードは変えず、テストクロックの Customer を API で作って
 * Checkout と同じ中身の Subscription を付け、アプリの同期・送信の関数（`syncCustomer` / `reportUsageFor`）を
 * クロックの時刻で呼ぶ。ローカルの Supabase と `.env.local` を使う
 *
 *   npx tsx --env-file=.env.local --conditions=react-server scripts/stripe/verify/clock.ts <シナリオ>
 */
import Stripe from 'stripe'
import { CUSTOMER_USER_ID_KEY } from '@/lib/billing/constants'
import { getStripe, resolvePriceId } from '@/lib/billing/stripe'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'

const key = process.env.STRIPE_SECRET_KEY ?? ''
if (!key.startsWith('sk_test_') && !key.startsWith('rk_test_')) {
  console.error('テスト用の鍵（sk_test_ / rk_test_）でだけ動かします')
  process.exit(1)
}

export const stripe = getStripe()
export const db = createPrivilegedClient()

export const at = (iso: string) => new Date(iso)
export const seconds = (date: Date) => Math.floor(date.getTime() / 1000)
export const fromSeconds = (value: number) => new Date(value * 1000)

/** 確認用の利用者（seed とは別）。profiles はトリガが作る */
export async function createUser(label: string): Promise<string> {
  const email = `verify-${label}-${Date.now()}@example.com`
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: 'password',
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

/** 在籍人数の履歴（トリガが書く表）を、クロックの時刻で直接作る */
export async function setHistory(userId: string, points: [string, number][]): Promise<void> {
  const { error } = await db.from('staff_count_history').insert(
    points.map(([changedAt, count]) => ({
      user_id: userId,
      active_count: count,
      changed_at: changedAt,
    }))
  )
  if (error) throw error
}

export async function setTrialEnd(userId: string, trialEnd: string | null): Promise<void> {
  const { error } = await db.from('profiles').update({ trial_end: trialEnd }).eq('id', userId)
  if (error) throw error
}

export type Clock = { id: string; customerId: string; userId: string }

/** テストクロック付きの Customer を作り、利用者に結び付ける（Checkout の Customer にはクロックを付けられない） */
export async function createClockCustomer(
  userId: string,
  name: string,
  frozen: Date,
  paymentMethod = 'pm_card_visa'
): Promise<Clock> {
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: seconds(frozen),
    name: `019 ${name}`,
  })
  const customer = await stripe.customers.create({
    test_clock: clock.id,
    name: `019 ${name}`,
    preferred_locales: ['ja'],
    metadata: { [CUSTOMER_USER_ID_KEY]: userId },
  })
  await attachCard(customer.id, paymentMethod)
  const { error } = await db
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', userId)
  if (error) throw error
  return { id: clock.id, customerId: customer.id, userId }
}

export async function attachCard(customerId: string, paymentMethod: string): Promise<string> {
  const attached = await stripe.paymentMethods.attach(paymentMethod, { customer: customerId })
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: attached.id },
  })
  return attached.id
}

/** Checkout（`checkoutSessionParams`）と同じ中身の Subscription */
export async function subscribe(clock: Clock): Promise<Stripe.Subscription> {
  return stripe.subscriptions.create({
    customer: clock.customerId,
    items: [{ price: await resolvePriceId(stripe) }],
    billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 },
    metadata: { [CUSTOMER_USER_ID_KEY]: clock.userId },
    payment_behavior: 'allow_incomplete',
  })
}

/** クロックを進めて、ready になるまで待つ */
export async function advance(clock: Clock, to: Date): Promise<Date> {
  await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: seconds(to) })
  for (let i = 0; i < 120; i += 1) {
    const current = await stripe.testHelpers.testClocks.retrieve(clock.id)
    if (current.status === 'ready') return fromSeconds(current.frozen_time)
    if (current.status === 'internal_failure') throw new Error(`clock ${clock.id} が失敗しました`)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw new Error(`clock ${clock.id} が ready になりません`)
}

const jst = (value: number) =>
  new Date(value * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

/** 請求書の要約（古い順） */
export async function invoices(clock: Clock): Promise<string[]> {
  const list = await stripe.invoices.list({ customer: clock.customerId, limit: 20 })
  return list.data
    .sort((a, b) => a.created - b.created)
    .map((invoice) => {
      const lines = invoice.lines.data
        .map(
          (line) =>
            `${line.description}（${jst(line.period.start)}〜${jst(line.period.end)}）${line.amount}円`
        )
        .join(' / ')
      return `${invoice.number ?? invoice.id} ${invoice.status} 合計 ${invoice.total}円 期間 ${jst(invoice.period_start)}〜${jst(invoice.period_end)} [${lines}]`
    })
}

export async function row(userId: string) {
  const { data, error } = await db
    .from('billing_subscriptions')
    .select(
      'status, cancel_at, current_period_start, current_period_end, price_lookup_key, discount_percent, has_schedule'
    )
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function profile(userId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('trial_end, stripe_customer_id')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export function log(label: string, value: unknown) {
  console.log(`- ${label}:`, typeof value === 'string' ? value : JSON.stringify(value, null, 0))
}
