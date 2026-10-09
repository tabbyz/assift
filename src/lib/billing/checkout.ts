import type Stripe from 'stripe'
import { CUSTOMER_USER_ID_KEY } from './constants'

/**
 * Checkout Session の引数（019 §4.3・§5.5）。純関数にしてテストで固定する。
 *
 * - 請求日は毎月末日 15:00 UTC（= 翌月 1 日 0:00 JST）。`day_of_month: 31` は短い月は月末に寄る
 * - トライアルは Stripe に持たせない（アプリの中で持つ。§7）ので anchor と併用できない制約に当たらない
 * - カードだけ。endive で `payment_method_types` は廃止されたので `allowed_payment_method_types` を使う
 * - クーポン・プロモーションコードは付けない（旧料金は移行で Subscription に付けるだけ）
 * - Adaptive Pricing（現地通貨での表示と請求）を切る。料金・規約は円（税込）で、海外の IP から開くと USD が既定で選ばれ、
 *   USD で請求する旨が出る（2026-10-08 にサンドボックスで確認。アカウントの設定が有効だと Session ごとに切るしかない）
 */
export function checkoutSessionParams(input: {
  customerId: string
  priceId: string
  userId: string
  successUrl: string
  cancelUrl: string
  now: Date
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'subscription',
    customer: input.customerId,
    client_reference_id: input.userId,
    line_items: [{ price: input.priceId }],
    allowed_payment_method_types: ['card'],
    adaptive_pricing: { enabled: false },
    locale: 'ja',
    subscription_data: {
      billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 },
      metadata: { [CUSTOMER_USER_ID_KEY]: input.userId },
    },
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    // 開きっぱなしの Session で 2 件目の契約ができないよう短くする（Stripe の下限は 30 分）
    expires_at: Math.floor(input.now.getTime() / 1000) + 30 * 60 + 60,
  }
}
