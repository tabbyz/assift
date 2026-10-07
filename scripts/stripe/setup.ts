/**
 * Stripe の初期設定（019 §4.1）。冪等。v1 の `stripe:create_product` / `create_plan` の置き換え。
 * test と live のそれぞれで 1 回流す（あとから流し直しても、既にあるものは作らない）。
 *
 *   STRIPE_SECRET_KEY=sk_test_... npm run stripe:setup
 *
 * 作るもの: Product（`assift`。v1 のものがあれば使い回す）/ Meter / Price（`assift_monthly`）/ Coupon（`assift_v1_legacy`）/
 * カスタマーポータルの既定の設定。Webhook の登録と Dashboard の設定（リトライ・メール）は手で行う（§4.1・§8.3）
 */
import Stripe from 'stripe'
import { LEGACY_COUPON_ID, METER_EVENT_NAME, PRICE_LOOKUP_KEY } from '@/lib/billing/constants'
import {
  FREE_STAFF_LIMIT,
  LEGACY_DISCOUNT_PERCENT,
  PRICE_PER_STAFF_YEN,
} from '@/lib/billing/pricing'
import { STRIPE_API_VERSION } from '@/lib/billing/stripe'

const PRODUCT_ID = 'assift'

const key = process.env.STRIPE_SECRET_KEY
if (!key) {
  console.error('STRIPE_SECRET_KEY を設定してください')
  process.exit(1)
}
const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION })

const isMissing = (error: unknown) =>
  error instanceof Stripe.errors.StripeError && error.statusCode === 404

async function ensureProduct(): Promise<string> {
  try {
    const product = await stripe.products.retrieve(PRODUCT_ID)
    console.log(`Product: ${product.id}（既存）`)
    return product.id
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  const product = await stripe.products.create({ id: PRODUCT_ID, name: 'assift' })
  console.log(`Product: ${product.id}（作成）`)
  return product.id
}

/** Meter は作成後に集計方法を変えられないので、ここで固定する（§4.2。max が無いので last） */
async function ensureMeter(): Promise<string> {
  for await (const meter of stripe.billing.meters.list({ status: 'active', limit: 100 })) {
    if (meter.event_name !== METER_EVENT_NAME) continue
    if (meter.default_aggregation.formula !== 'last') {
      throw new Error(
        `Meter ${meter.id} の集計が last ではありません（${meter.default_aggregation.formula}）`
      )
    }
    console.log(`Meter: ${meter.id}（既存）`)
    return meter.id
  }
  const meter = await stripe.billing.meters.create({
    display_name: '在籍スタッフ数（期間の最大）',
    event_name: METER_EVENT_NAME,
    default_aggregation: { formula: 'last' },
    customer_mapping: { type: 'by_id', event_payload_key: 'stripe_customer_id' },
    value_settings: { event_payload_key: 'value' },
  })
  console.log(`Meter: ${meter.id}（作成）`)
  return meter.id
}

/** 10 人まで 0 円、11 人目から 1 人 100 円（graduated）。数字は lib/billing/pricing と同じ */
async function ensurePrice(productId: string, meterId: string): Promise<string> {
  const existing = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEY], limit: 1 })
  const price = existing.data[0]
  if (price) {
    console.log(`Price: ${price.id}（既存。lookup_key: ${PRICE_LOOKUP_KEY}）`)
    return price.id
  }
  const created = await stripe.prices.create({
    product: productId,
    lookup_key: PRICE_LOOKUP_KEY,
    nickname: '月額（在籍スタッフの最大人数）',
    currency: 'jpy',
    recurring: { interval: 'month', usage_type: 'metered', meter: meterId },
    billing_scheme: 'tiered',
    tiers_mode: 'graduated',
    tiers: [
      { up_to: FREE_STAFF_LIMIT, unit_amount: 0 },
      { up_to: 'inf', unit_amount: PRICE_PER_STAFF_YEN },
    ],
    tax_behavior: 'inclusive',
  })
  console.log(`Price: ${created.id}（作成）`)
  return created.id
}

/** 旧料金（v1 からの継続）。名前は請求書に出る（§2.4） */
async function ensureCoupon(): Promise<void> {
  try {
    const coupon = await stripe.coupons.retrieve(LEGACY_COUPON_ID)
    if (coupon.percent_off !== LEGACY_DISCOUNT_PERCENT || coupon.duration !== 'forever') {
      throw new Error(
        `Coupon ${coupon.id} の中身が違います（${coupon.percent_off}% / ${coupon.duration}）`
      )
    }
    console.log(`Coupon: ${coupon.id}（既存）`)
    return
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  await stripe.coupons.create({
    id: LEGACY_COUPON_ID,
    name: '旧料金（v1 からのご継続）',
    percent_off: LEGACY_DISCOUNT_PERCENT,
    duration: 'forever',
  })
  console.log(`Coupon: ${LEGACY_COUPON_ID}（作成）`)
}

/** カスタマーポータル: 請求書・支払い方法・宛名・期間の終わりに解約。プランの変更とクーポンは出さない */
async function ensurePortal(): Promise<void> {
  const features: Stripe.BillingPortal.ConfigurationCreateParams.Features = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    customer_update: { enabled: true, allowed_updates: ['name'] },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      proration_behavior: 'none',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'unused', 'switched_service', 'missing_features', 'other'],
      },
    },
    subscription_update: { enabled: false },
  }
  const configurations = await stripe.billingPortal.configurations.list({
    is_default: true,
    limit: 1,
  })
  const current = configurations.data[0]
  if (current) {
    await stripe.billingPortal.configurations.update(current.id, { features })
    console.log(`Portal: ${current.id}（更新）`)
    return
  }
  const created = await stripe.billingPortal.configurations.create({ features })
  console.log(`Portal: ${created.id}（作成）`)
}

async function main() {
  const mode = key!.startsWith('sk_live') || key!.startsWith('rk_live') ? 'live' : 'test'
  console.log(`Stripe（${mode}）を設定します`)
  const productId = await ensureProduct()
  const meterId = await ensureMeter()
  await ensurePrice(productId, meterId)
  await ensureCoupon()
  await ensurePortal()
  console.log('完了。Webhook の登録と Dashboard の設定（019 §4.1・§8.3）は手で行ってください')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
