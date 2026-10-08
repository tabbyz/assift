import 'server-only'
import type Stripe from 'stripe'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { LEGACY_API_VERSION } from './constants'
import { isEntitledStatus } from './entitlement'
import { readBillingProfile } from './profile'
import { reportUsageFor } from './report'
import { getStripe } from './stripe'
import { syncCustomer } from './sync'

/**
 * 解約（019 §5.5・§5.8）。期間の終わりで終える（即時解約は従量分が捨てられる。§3）。
 *
 * v1 からの切り替え待ち（schedule 付き）の契約は、**schedule を release しない**。release してから
 * `cancel_at_period_end` にすると、ポータルで解約を取り消せてしまい、旧 metered の price のまま schedule も無い契約が残る
 * （v1 の rake が止まった後は利用量が 0 になり、以後ずっと無料になる）。そこで新料金の phase を消し、今の phase の終わりで
 * `end_behavior: cancel` にする。旧 metered の明細を含むので API `2025-02-24.acacia` で呼ぶ（basil 以降は触れない）
 */

const LEGACY = { apiVersion: LEGACY_API_VERSION }

const idOf = (value: string | { id: string }) => (typeof value === 'string' ? value : value.id)

/**
 * 既存の phase を update の引数に写す（今の phase を変えずに残すため）。移行スクリプトと共有する。
 * 旧 metered の price は数量を持たない（付けると Stripe が弾く）
 */
export function phaseParams(
  phase: Stripe.SubscriptionSchedule.Phase & { trial_end?: number | null }
): Stripe.SubscriptionScheduleUpdateParams.Phase {
  return {
    start_date: phase.start_date,
    end_date: phase.end_date,
    items: phase.items.map((item) =>
      item.quantity === undefined || item.quantity === null
        ? { price: idOf(item.price) }
        : { price: idOf(item.price), quantity: item.quantity }
    ),
    discounts: phase.discounts.flatMap((discount) =>
      discount.coupon ? [{ coupon: idOf(discount.coupon) }] : []
    ),
    ...(phase.trial_end ? { trial_end: phase.trial_end } : {}),
  }
}

/** schedule を今の phase だけにして、その終わりで Subscription を解約する */
export async function endScheduleAtCurrentPhase(stripe: Stripe, scheduleId: string): Promise<void> {
  const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId, {}, LEGACY)
  const current = schedule.current_phase
  if (schedule.status !== 'active' || !current) {
    throw new Error(
      `schedule が有効ではありません (schedule: ${scheduleId}, status: ${schedule.status})`
    )
  }
  const phase = schedule.phases.find((candidate) => candidate.start_date === current.start_date)
  if (!phase) throw new Error(`今の phase が見つかりません (schedule: ${scheduleId})`)

  await stripe.subscriptionSchedules.update(
    scheduleId,
    {
      end_behavior: 'cancel',
      proration_behavior: 'none',
      phases: [phaseParams(phase)],
    },
    LEGACY
  )
}

/** 1 件を期間の終わりで解約する。schedule が付いていれば schedule 側で終える */
export async function cancelAtPeriodEnd(
  stripe: Stripe,
  subscription: Stripe.Subscription
): Promise<void> {
  const schedule = subscription.schedule
  const scheduleStatus = schedule && typeof schedule === 'object' ? schedule.status : null
  if (schedule && (typeof schedule === 'string' || scheduleStatus === 'active')) {
    await endScheduleAtCurrentPhase(stripe, idOf(schedule))
    return
  }
  if (subscription.cancel_at_period_end) return
  await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true })
}

/**
 * 退会の前に呼ぶ（§5.8）。今の期間の最大人数を送ってから、有効な契約をすべて期間の終わりで解約する。
 * 失敗したら例外を投げる（呼び出し側は退会を止める。請求できないまま消さない）
 */
export async function cancelSubscriptionsForAccountDeletion(
  userId: string,
  now = new Date()
): Promise<void> {
  const profile = await readBillingProfile(createPrivilegedClient(), userId)
  const customerId = profile?.stripeCustomerId
  if (!customerId) return

  const stripe = getStripe()
  // 期間・状態を最新にしてから送る（Webhook が遅れていても今の期間に送る）
  await syncCustomer(customerId, now)
  // 以降は履歴が消えるので、これがその期間の最後の値になる
  await reportUsageFor(userId, now)

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 20,
    expand: ['data.schedule'],
  })
  for (const subscription of subscriptions.data) {
    if (!isEntitledStatus(subscription.status)) continue
    await cancelAtPeriodEnd(stripe, subscription)
  }
}
