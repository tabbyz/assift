import type Stripe from 'stripe'
import { getStripe, isStripeConfigured } from '@/lib/billing/stripe'
import { reportUsageFor } from '@/lib/billing/report'
import { syncCustomer } from '@/lib/billing/sync'

export const runtime = 'nodejs'

/**
 * Stripe の Webhook（019 §5.6）。署名を生の body で検証し、イベントの中身は使わずに Customer を取り直して写す
 * （イベントは順不同・重複ありなので、中身から状態を組み立てない）。
 *
 * - 署名が無い・合わない: 400
 * - 写すのに失敗: 500（Stripe が再送する）
 * - 鍵が未設定: 503
 */
const HANDLED = new Set<Stripe.Event.Type>([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.payment_action_required',
])

function customerOf(event: Stripe.Event): string | null {
  const object = event.data.object as { customer?: string | { id: string } | null }
  const customer = object.customer
  if (!customer) return null
  return typeof customer === 'string' ? customer : customer.id
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!isStripeConfigured() || !secret)
    return new Response('Stripe is not configured', { status: 503 })

  const signature = request.headers.get('stripe-signature')
  if (!signature) return new Response('Missing signature', { status: 400 })

  const body = await request.text()
  let event: Stripe.Event
  try {
    event = await getStripe().webhooks.constructEventAsync(body, signature, secret)
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  if (!HANDLED.has(event.type)) return new Response(null, { status: 204 })

  const customerId = customerOf(event)
  if (!customerId) return new Response(null, { status: 204 })

  try {
    const synced = await syncCustomer(customerId)
    // 申し込み直後に 1 回送る（§4.2）。トライアル中なら 0 になる。以降は毎日の cron
    if (synced && event.type === 'customer.subscription.created')
      await reportUsageFor(synced.userId)
  } catch (error) {
    console.error(
      `[billing] Webhook の同期に失敗しました (event: ${event.id}, type: ${event.type})`,
      error
    )
    return new Response('Sync failed', { status: 500 })
  }
  return new Response(null, { status: 204 })
}
