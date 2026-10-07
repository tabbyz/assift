import type Stripe from 'stripe'
import { METER_EVENT_NAME } from './constants'

/**
 * Billing Meter への送信（019 §4.2）。集計は `last` なので「その期間のここまでの最大人数」を送る。
 */

const ONE_MINUTE = 60 * 1000

/**
 * 同じ値の二重送信を Stripe が捨てる鍵（一意性は 24 時間以上。`last` なので重複しても請求は変わらない）。
 * 100 文字まで
 */
export function meterIdentifier(subscriptionId: string, periodStart: Date, peak: number): string {
  return `${subscriptionId}:${Math.floor(periodStart.getTime() / 1000)}:${peak}`
}

/**
 * イベントの時刻（秒）。期間の終わりの 1 分前より後にしない。
 * v1 から引き継ぐ契約は期間の終わりが 23:59:59 JST なので、23 時台の cron が次の期間へはみ出さないように
 */
export function meterTimestamp(now: Date, periodEnd: Date): number {
  return Math.floor(Math.min(now.getTime(), periodEnd.getTime() - ONE_MINUTE) / 1000)
}

export async function sendPeak(
  stripe: Stripe,
  input: {
    customerId: string
    subscriptionId: string
    periodStart: Date
    periodEnd: Date
    peak: number
    now: Date
  }
): Promise<void> {
  await stripe.billing.meterEvents.create({
    event_name: METER_EVENT_NAME,
    identifier: meterIdentifier(input.subscriptionId, input.periodStart, input.peak),
    timestamp: meterTimestamp(input.now, input.periodEnd),
    payload: { stripe_customer_id: input.customerId, value: String(input.peak) },
  })
}
