import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SimpleShell } from '@/components/SimpleShell'
import { PRICE_LOOKUP_KEY } from '@/lib/billing/constants'
import { isEntitledStatus } from '@/lib/billing/entitlement'
import { isStripeConfigured } from '@/lib/billing/stripe'
import { syncCustomer } from '@/lib/billing/sync'
import { firstDayFrom, lastDayBefore, trialLastDay } from '@/lib/billing/trial'
import {
  getBillingOverview,
  getPeriodPeak,
  getStripeCustomerId,
  getSyncedAt,
} from '@/lib/queries/billing'
import { getAuthUser } from '@/utils/auth/current'
import { firstString } from '@/utils/searchParams'
import { BillingClient, type BillingView } from './_components/BillingClient'

export const metadata: Metadata = { title: 'プランとお支払い' }

/** 写しがこれより古ければ描画の前に Stripe から取り直す（preview には Webhook が届かない。019 §5.6） */
const STALE_MS = 10 * 60 * 1000

export default async function BillingPage({ searchParams }: PageProps<'/account/billing'>) {
  const params = await searchParams
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const checkoutSuccess = firstString(params.checkout) === 'success'
  const now = new Date()

  // 読む前に同期する（getBillingOverview は cache() 済みなので、同期のあとに 1 回だけ読む）
  const customerId = await getStripeCustomerId(user.id)
  if (customerId && isStripeConfigured()) {
    await syncIfStale(user.id, customerId, checkoutSuccess, now)
  }

  const overview = await getBillingOverview(user.id)
  const { subscription, entitlement } = overview
  const entitled = subscription !== null && isEntitledStatus(subscription.status)
  // 料金の見込みは新料金の price だけ（切り替え待ちの間は v1 で選んでいた上限人数で請求される）
  const estimable = entitled && subscription.price_lookup_key === PRICE_LOOKUP_KEY
  const periodPeak = estimable
    ? await getPeriodPeak(user.id, subscription, overview.trialEnd, now)
    : null

  const view: BillingView = {
    kind: entitlement.kind,
    limit: overview.limit,
    activeStaffCount: overview.activeStaffCount,
    trialAvailable: overview.trialAvailable,
    trialLastDay: entitlement.kind === 'trial' ? trialLastDay(entitlement.trialEnd) : null,
    subscription:
      entitled && subscription
        ? {
            status: subscription.status,
            discountPercent: subscription.discount_percent ?? 0,
            hasSchedule: subscription.has_schedule,
            legacyPeriod: subscription.price_lookup_key !== PRICE_LOOKUP_KEY,
            periodFirstDay: firstDayFrom(new Date(subscription.current_period_start)),
            periodLastDay: lastDayBefore(new Date(subscription.current_period_end)),
            cancelLastDay: subscription.cancel_at
              ? lastDayBefore(new Date(subscription.cancel_at))
              : null,
            periodPeak,
          }
        : null,
    billingAvailable: isStripeConfigured(),
    hasCustomer: overview.hasCustomer,
  }

  return (
    <SimpleShell>
      <BillingClient view={view} checkoutSuccess={checkoutSuccess} />
    </SimpleShell>
  )
}

async function syncIfStale(userId: string, customerId: string, force: boolean, now: Date) {
  // 写しが無いのは、申し込んでいない（Checkout を開いて戻った）か、申し込み直後で Webhook がまだのとき。
  // 後者は Checkout からの戻り（force）で取り直す。それ以外で毎回 Stripe を呼ぶと、申し込まなかった人が開くたびに遅くなる
  // （Webhook を落としても Stripe の再送と毎日の cron が拾う）
  const syncedAt = await getSyncedAt(userId)
  if (!force && (!syncedAt || now.getTime() - syncedAt.getTime() < STALE_MS)) return
  try {
    await syncCustomer(customerId, now)
  } catch (error) {
    // Stripe が落ちていても画面は写しで出す
    console.error(`[billing] 描画時の同期に失敗しました (user: ${userId})`, error)
  }
}
