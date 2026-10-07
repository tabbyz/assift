'use server'

import { revalidatePath } from 'next/cache'
import { fail } from '@/lib/actions/error'
import { requireUser } from '@/lib/actions/guards'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { endScheduleAtCurrentPhase } from '@/lib/billing/cancel'
import { checkoutSessionParams } from '@/lib/billing/checkout'
import { LEGACY_API_VERSION } from '@/lib/billing/constants'
import { ensureCustomer } from '@/lib/billing/customer'
import { isEntitledStatus } from '@/lib/billing/entitlement'
import { getStripe, isStripeConfigured, resolvePriceId } from '@/lib/billing/stripe'
import { syncCustomer } from '@/lib/billing/sync'
import { requestOrigin } from '@/lib/auth/requestOrigin'
import { getBillingOverview, getStripeCustomerId } from '@/lib/queries/billing'

/**
 * プランとお支払いの書き込み（019 §5.5）。外部 URL（Checkout・ポータル）へは redirect() せず `{ redirectTo }` を返し、
 * クライアントが `window.location.assign` で移る（認証系と同じく ActionResult の契約を保つ）。
 * Stripe の Customer は**入力から受け取らず**、ログイン中の利用者の `profiles.stripe_customer_id` だけを使う
 */

const UNAVAILABLE_MESSAGE = '現在お申し込みを受け付けられません。時間をおいてお試しください'

function requireStripe() {
  if (!isStripeConfigured()) fail(UNAVAILABLE_MESSAGE)
  return getStripe()
}

/**
 * 有料プランに申し込む（Checkout へ）。同期してから既に有料なら断る（二重契約を防ぐ）。
 * それでも 2 件できたら同期が新しいほうを即時解約する（§5.5）
 */
export async function startCheckout(): Promise<ActionResult<{ redirectTo: string }>> {
  return runAction(async () => {
    const user = await requireUser()
    const stripe = requireStripe()

    const existing = await getStripeCustomerId(user.id)
    if (existing) {
      await syncCustomer(existing)
      const overview = await getBillingOverview(user.id)
      if (isEntitledStatus(overview.subscription?.status ?? null)) fail('有料プランをご利用中です')
    }
    const customerId = existing ?? (await ensureCustomer(user))

    const origin = await requestOrigin()
    const session = await stripe.checkout.sessions.create(
      checkoutSessionParams({
        customerId,
        priceId: await resolvePriceId(stripe),
        userId: user.id,
        successUrl: `${origin}/account/billing?checkout=success`,
        cancelUrl: `${origin}/account/billing/subscribe`,
        now: new Date(),
      })
    )
    if (!session.url) throw new Error('Checkout の URL がありません')
    return { redirectTo: session.url }
  })
}

/**
 * v1 からの切り替え待ち（schedule 付き）の間の解約（§5.5・§11-11）。ポータルは schedule 付きの契約を解約できないため。
 * 今の期間の終わりで終わる。取り消しは問い合わせで受ける
 */
export async function cancelDuringMigration(): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser()
    const stripe = requireStripe()
    const customerId = await getStripeCustomerId(user.id)
    if (!customerId) fail('お支払いの情報がありません')

    const overview = await getBillingOverview(user.id)
    const row = overview.subscription
    if (!row || !row.has_schedule || !isEntitledStatus(row.status)) {
      fail('この操作は現在のプランでは使えません。お支払いの管理画面から解約してください')
    }

    const subscription = await stripe.subscriptions.retrieve(
      row.stripe_subscription_id,
      {},
      {
        apiVersion: LEGACY_API_VERSION,
      }
    )
    // DB の写しが他人の契約を指していても触らない（Customer で突き合わせる）
    const ownerId =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
    if (ownerId !== customerId) fail('お支払いの情報が一致しません')
    if (!subscription.schedule) fail('この操作は現在のプランでは使えません')

    const scheduleId =
      typeof subscription.schedule === 'string' ? subscription.schedule : subscription.schedule.id
    await endScheduleAtCurrentPhase(stripe, scheduleId)
    await syncCustomer(customerId)
    revalidatePath('/', 'layout')
  })
}
