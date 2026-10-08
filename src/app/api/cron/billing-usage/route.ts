import { reportAllUsage } from '@/lib/billing/report'
import { isStripeConfigured } from '@/lib/billing/stripe'
import { syncAllSubscriptions } from '@/lib/billing/sync'

export const runtime = 'nodejs'
/** 数百件を同期して送る。Stripe への呼び出しは一覧でまとめ、送信は並行にする（019 §5.7） */
export const maxDuration = 300

/**
 * 毎日 22 時台と 23 時台（JST）の定期実行（`vercel.json`）。Vercel Cron は `Authorization: Bearer ${CRON_SECRET}` を付けて呼ぶ。
 * 1. 全員の状態を同期する（Webhook を落とした日の保険）
 * 2. 有料プランの全員に、今の期間の最大人数を送る（期間の最終日の送信がそのまま請求に効く）
 *
 * 最終日の送信が落ちると、その期間の増員は二度と送れない（翌日は新しい期間に移っている）。そこで 1 日 2 回走らせ、
 * 同期が失敗しても送信は止めない（写しが 1 日古くても、期間と契約は前日の同期で分かっている）。
 * どちらかが例外で終わったか、1 人でも失敗したら 500 にする（Vercel の実行履歴で気付けるように。重複の断りは成功に数える）
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!isStripeConfigured()) return new Response('Stripe is not configured', { status: 503 })

  const now = new Date()
  const sync = await syncAllSubscriptions(now).catch((error: unknown) => {
    console.error('[billing] 定期実行の同期に失敗しました', error)
    return null
  })
  const usage = await reportAllUsage(now).catch((error: unknown) => {
    console.error('[billing] 定期実行の送信に失敗しました', error)
    return null
  })
  console.info('[billing] 定期実行', { sync, usage })
  const ok = sync !== null && usage !== null && sync.failed === 0 && usage.failed === 0
  return Response.json({ sync, usage }, { status: ok ? 200 : 500 })
}
