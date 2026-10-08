import 'server-only'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { CUSTOMER_USER_ID_KEY } from './constants'
import { readBillingProfile } from './profile'
import { getStripe } from './stripe'

/**
 * 利用者の Stripe の Customer を作って `profiles.stripe_customer_id` に保存する（019 §5.5）。既にあればそれを返す。
 * 利用者が書ける口は作らない（§5.2）ので、書くのはここ（service_role）と移行スクリプトだけ。
 * 同時に 2 回呼ばれたら、先に保存されたほうを使い、余った Customer は消す（Customer が 2 つに割れないように）
 */
export async function ensureCustomer(user: { id: string; email: string | null }): Promise<string> {
  const db = createPrivilegedClient()
  const read = async () => (await readBillingProfile(db, user.id))?.stripeCustomerId ?? null

  const existing = await read()
  if (existing) return existing

  const stripe = getStripe()
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    preferred_locales: ['ja'],
    metadata: { [CUSTOMER_USER_ID_KEY]: user.id },
  })
  const { error } = await db
    .from('profiles')
    .update({ stripe_customer_id: customer.id })
    .eq('id', user.id)
    .is('stripe_customer_id', null)
  if (error) throw error

  const saved = await read()
  if (!saved) throw new Error(`Customer を保存できません (user: ${user.id})`)
  if (saved !== customer.id) await stripe.customers.del(customer.id)
  return saved
}
