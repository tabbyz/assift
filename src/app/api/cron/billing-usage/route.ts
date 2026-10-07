import { reportAllUsage } from '@/lib/billing/report'
import { isStripeConfigured } from '@/lib/billing/stripe'
import { syncAllSubscriptions } from '@/lib/billing/sync'

export const runtime = 'nodejs'
/** 数百件を同期して送る。Stripe への呼び出しは一覧でまとめ、送信は並行にする（019 §5.7） */
export const maxDuration = 300

/**
 * 毎日 23 時台（JST）の定期実行（`vercel.json`）。Vercel Cron は `Authorization: Bearer ${CRON_SECRET}` を付けて呼ぶ。
 * 1. 全員の状態を同期する（Webhook を落とした日の保険）
 * 2. 有料プランの全員に、今の期間の最大人数を送る（期間の最終日の送信がそのまま請求に効く）
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!isStripeConfigured()) return new Response('Stripe is not configured', { status: 503 })

  const now = new Date()
  const sync = await syncAllSubscriptions(now)
  const usage = await reportAllUsage(now)
  console.info('[billing] 定期実行', { sync, usage })
  return Response.json({ sync, usage })
}
