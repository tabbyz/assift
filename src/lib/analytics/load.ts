import { type AdminHostEnv, isAdminHost } from '@/lib/admin/host'

/**
 * アクセス解析（Vercel Web Analytics。025 §4.1）を読み込むか。本番の本体のホストだけ。
 *
 * - プレビュー・開発・`next start`（`VERCEL_ENV` が `production` でない）は読み込まない（025 §3-4）
 * - 管理画面のホストは外す（020 §8。`?q=` にメールアドレスが載る）。本番の管理画面はそのホストでしか開かないので、
 *   パスではなくホストで決める。`ADMIN_HOST` が無い本番では管理画面が 404 なので、どのホストでも読み込む
 */
export function shouldLoadAnalytics(host: string | null, env: AdminHostEnv): boolean {
  return env.production && !isAdminHost(host, env)
}
