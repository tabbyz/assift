import 'server-only'
import { createPrivilegedClient } from '@/lib/supabase/createPrivilegedClient'
import { PRICE_LOOKUP_KEY } from './constants'
import { ENTITLED_STATUSES } from './entitlement'
import { peakWindow, readStaffCountHistory } from './history'
import { billableStaffPeak } from './peak'
import { listEntitledSubscriptions, readBillingProfile } from './profile'
import { getStripe } from './stripe'
import { sendPeak } from './usage'

/**
 * 最大人数を Billing Meter に送る（019 §4.2）。毎日 22 時台・23 時台の定期実行・申し込み直後・退会で呼ぶ。
 * 送るたびに履歴から期間の始めからの最大人数を計算し直すので、途中の 1 日が落ちても翌日の送信で追いつく。
 * 期間の最終日の送信が落ちたときだけは取り返せない（翌日は新しい期間）ので、定期実行は 1 日 2 回にしてある
 * service_role で読むので、クエリはすべて 1 人（`user_id` / `id`）に絞る
 */

type Db = ReturnType<typeof createPrivilegedClient>

/** 同時に送る利用者の数。同じ利用者への同時送信は 1 本まで（Stripe の制限）なので、1 人の中では順に送る */
const CONCURRENCY = 10

type Target = {
  userId: string
  subscriptionId: string
  periodStart: Date
  periodEnd: Date
}

async function peakFor(db: Db, target: Target, now: Date) {
  const profile = await readBillingProfile(db, target.userId)
  if (!profile?.stripeCustomerId) return null

  const trialEnd = profile.trialEnd
  const window = peakWindow(target.periodStart, target.periodEnd, trialEnd, now)
  const history = await readStaffCountHistory(db, target.userId, window)
  const peak = billableStaffPeak({
    history,
    periodStart: target.periodStart,
    periodEnd: target.periodEnd,
    trialEnd,
    until: now,
  })
  return { customerId: profile.stripeCustomerId, peak }
}

async function reportTarget(db: Db, target: Target, now: Date): Promise<void> {
  const result = await peakFor(db, target, now)
  if (!result) return
  await sendPeak(getStripe(), {
    customerId: result.customerId,
    subscriptionId: target.subscriptionId,
    periodStart: target.periodStart,
    periodEnd: target.periodEnd,
    peak: result.peak,
    now,
  })
}

const toTarget = (row: {
  user_id: string
  stripe_subscription_id: string
  current_period_start: string
  current_period_end: string
}): Target => ({
  userId: row.user_id,
  subscriptionId: row.stripe_subscription_id,
  periodStart: new Date(row.current_period_start),
  periodEnd: new Date(row.current_period_end),
})

/** 1 人分を送る（申し込み直後・退会）。新料金の price で有効な契約が無ければ何もしない */
export async function reportUsageFor(userId: string, now = new Date()): Promise<void> {
  const db = createPrivilegedClient()
  const { data, error } = await db
    .from('billing_subscriptions')
    .select('user_id, stripe_subscription_id, current_period_start, current_period_end')
    .eq('user_id', userId)
    .eq('price_lookup_key', PRICE_LOOKUP_KEY)
    .in('status', [...ENTITLED_STATUSES])
    .maybeSingle()
  if (error) throw error
  if (data) await reportTarget(db, toTarget(data), now)
}

/**
 * 有料プランの全員に送る（定期実行）。v1 からの切り替え待ち（旧 price）の契約は、その期間を v1 が送った上限で請求するので送らない。
 * 旧 price のまま切り替えの予約も無い有効な契約は、利用量が送られず無料になってしまうので見張ってログに出す（§5.7）
 */
export async function reportAllUsage(now = new Date()): Promise<{ sent: number; failed: number }> {
  const db = createPrivilegedClient()
  const rows = await listEntitledSubscriptions(db)
  for (const row of rows) {
    if (row.price_lookup_key !== PRICE_LOOKUP_KEY && !row.has_schedule) {
      console.error(
        `[billing] 旧 price のまま切り替えの予約が無い契約があります (user: ${row.user_id}, subscription: ${row.stripe_subscription_id})`
      )
    }
  }

  const targets = rows.filter((row) => row.price_lookup_key === PRICE_LOOKUP_KEY).map(toTarget)
  let sent = 0
  let failed = 0
  let next = 0
  const worker = async () => {
    while (next < targets.length) {
      const target = targets[next++]
      try {
        await reportTarget(db, target, now)
        sent += 1
      } catch (sendError) {
        failed += 1
        console.error(`[billing] 人数の送信に失敗しました (user: ${target.userId})`, sendError)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, worker))
  return { sent, failed }
}
