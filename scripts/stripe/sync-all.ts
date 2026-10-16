/**
 * 全員の同期（026 §7）。カットオーバーで、引き継ぎ（`stripe:migrate-v1 -- --apply`）のあとに 1 回流す。
 * cron（`api/cron/billing-usage`）と同じ `syncAllSubscriptions()` だけを呼び、人数の送信（`reportAllUsage`）はしない
 * （当日は cron を止めており、新料金の契約も無いので送るものが無い）。何度流しても同じ写しになる。
 *
 *   STRIPE_SECRET_KEY='…' NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SECRET_KEY='…' npm run stripe:sync-all
 *
 * tsx は `.env*` を読まない。値はコマンドごとに渡す。シェルに残った別の環境の値で流しても `failed: 0` で通ってしまうので、
 * 最初に接続先（Supabase のホストと Stripe の鍵の種類）を出す
 */
import { syncAllSubscriptions } from '@/lib/billing/sync'

const REQUIRED = ['STRIPE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'] as const

const missing = REQUIRED.filter((name) => !process.env[name])
if (missing.length > 0) {
  console.error(`${missing.join(' / ')} を設定してください`)
  process.exit(1)
}

/** 鍵の種類だけを出す（値は出さない） */
function keyMode(key: string): string {
  if (/^[sr]k_live_/.test(key)) return 'live'
  if (/^[sr]k_test_/.test(key)) return 'test'
  return '不明'
}

async function main() {
  const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host
  const mode = keyMode(process.env.STRIPE_SECRET_KEY ?? '')
  console.log(`接続先: Supabase ${host} / Stripe ${mode}`)

  const started = Date.now()
  const { synced, failed } = await syncAllSubscriptions()
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(`synced: ${synced}, failed: ${failed}（${seconds} 秒）`)
  // process.exit() はパイプ（`| tee`）に出した最後の行を落としうるので、終了コードだけ付けて自然に終わらせる
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
