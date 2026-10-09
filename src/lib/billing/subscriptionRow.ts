import type Stripe from 'stripe'
import type { Database } from '@/types/database'
import { LEGACY_COUPON_ID } from './constants'
import { isEntitledStatus } from './entitlement'
import { LEGACY_DISCOUNT_PERCENT } from './pricing'

/**
 * Stripe の Subscription を `billing_subscriptions` の行に写す純関数（019 §5.6）。同期関数と定期実行が共有する。
 * Stripe の型だけに依存し、SDK は使わない（Vitest で固定する）
 */

export type BillingSubscriptionRow = Database['public']['Tables']['billing_subscriptions']['Insert']

/**
 * 1 人に有効な契約が 2 件以上あれば、古いほうを残し、新しいほう（誤って作られたほう）を解約の対象にする。
 * 古いほうを残すのは、旧料金のクーポンが付いた契約を失わないため（019 §5.5）。
 * 有効な契約が無ければ、いちばん新しい契約（解約済みなど）を写す
 */
export function chooseSubscription(subscriptions: Stripe.Subscription[]): {
  keep: Stripe.Subscription | null
  duplicates: Stripe.Subscription[]
} {
  const entitled = subscriptions
    .filter((subscription) => isEntitledStatus(subscription.status))
    .sort((a, b) => a.created - b.created)
  // 同じ契約が 2 回渡されても（新旧両方の price の一覧に出る）自分を解約の対象にしない
  if (entitled.length > 0)
    return {
      keep: entitled[0],
      duplicates: entitled.slice(1).filter((subscription) => subscription.id !== entitled[0].id),
    }
  const latest = [...subscriptions].sort((a, b) => b.created - a.created)[0] ?? null
  return { keep: latest, duplicates: [] }
}

function couponPercent(coupon: string | Stripe.Coupon | null | undefined): number | null {
  if (!coupon) return null
  if (typeof coupon === 'string')
    return coupon === LEGACY_COUPON_ID ? LEGACY_DISCOUNT_PERCENT : null
  if (coupon.percent_off !== null) return coupon.percent_off
  return coupon.id === LEGACY_COUPON_ID ? LEGACY_DISCOUNT_PERCENT : null
}

/** 適用中の割引（%）。`expand: ['data.discounts']` で Discount が展開されている前提（文字列なら読めないので null） */
function currentDiscountPercent(subscription: Stripe.Subscription): number | null {
  for (const discount of subscription.discounts) {
    if (typeof discount === 'string') continue
    const percent = couponPercent(discount.source.coupon)
    if (percent !== null) return percent
  }
  return null
}

/**
 * v1 からの切り替え待ち（schedule 付き）の間は、次の phase に付く割引を写す（画面に「旧料金」と出すため）。
 * `expand: ['data.schedule']` の前提
 */
function scheduledDiscountPercent(schedule: Stripe.SubscriptionSchedule, now: Date): number | null {
  const nowSeconds = Math.floor(now.getTime() / 1000)
  for (const phase of schedule.phases) {
    if (phase.start_date <= nowSeconds) continue
    for (const discount of phase.discounts) {
      const percent = couponPercent(discount.coupon)
      if (percent !== null) return percent
    }
  }
  return null
}

function isOpenSchedule(schedule: Stripe.Subscription['schedule']): boolean {
  if (!schedule) return false
  if (typeof schedule === 'string') return true
  return schedule.status === 'active' || schedule.status === 'not_started'
}

/**
 * 切り替え待ちの間に解約した（schedule を `end_behavior: cancel` にした）ときの終了日 = 最後の phase の終わり（§5.5）。
 * Subscription の `cancel_at` に出ない場合に備えて schedule から読む
 */
function scheduledCancelAt(schedule: Stripe.SubscriptionSchedule): number | null {
  if (schedule.end_behavior !== 'cancel') return null
  const last = schedule.phases.at(-1)
  return last ? last.end_date : null
}

const toIso = (seconds: number) => new Date(seconds * 1000).toISOString()

export function subscriptionRow(
  userId: string,
  subscription: Stripe.Subscription,
  now: Date
): BillingSubscriptionRow {
  const item = subscription.items.data[0]
  const price = item?.price
  const schedule = typeof subscription.schedule === 'object' ? subscription.schedule : null
  const hasSchedule = isOpenSchedule(subscription.schedule)
  const periodStart = item?.current_period_start ?? subscription.start_date
  const periodEnd = item?.current_period_end ?? subscription.start_date
  const cancelAt =
    subscription.cancel_at ??
    (subscription.cancel_at_period_end ? periodEnd : null) ??
    (hasSchedule && schedule ? scheduledCancelAt(schedule) : null)

  return {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    price_lookup_key: price ? (price.lookup_key ?? price.id) : null,
    discount_percent:
      currentDiscountPercent(subscription) ??
      (hasSchedule && schedule ? scheduledDiscountPercent(schedule, now) : null),
    cancel_at: cancelAt === null ? null : toIso(cancelAt),
    current_period_start: toIso(periodStart),
    current_period_end: toIso(periodEnd),
    has_schedule: hasSchedule,
    synced_at: now.toISOString(),
  }
}
