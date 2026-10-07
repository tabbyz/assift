import 'server-only'
import Stripe from 'stripe'
import { PRICE_LOOKUP_KEY } from './constants'

/**
 * Stripe の SDK（019 §4.1）。API の版は SDK が固定する最新（`2026-09-30.endive`）に合わせる。
 * 鍵は権限を絞った制限付きキー。未設定なら課金の機能だけを「現在利用できません」にし、ほかは動かす（§6）
 */
export const STRIPE_API_VERSION = '2026-09-30.endive'

let client: Stripe | null = null

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('STRIPE_SECRET_KEY を設定してください')
  client ??= new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 })
  return client
}

/** lookup_key から price の id を引く（test / live で id が違っても同じコードにする） */
export async function resolvePriceId(stripe: Stripe): Promise<string> {
  const prices = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  })
  const price = prices.data[0]
  if (!price)
    throw new Error(
      `price が見つかりません（lookup_key: ${PRICE_LOOKUP_KEY}）。scripts/stripe/setup.ts を流してください`
    )
  return price.id
}
