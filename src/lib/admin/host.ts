import { isAdminPath } from './paths'

/**
 * 管理画面を開くホストの判定（020 §4.2）。proxy（振り分け）とサーバーの確認（`lib/admin/guard.ts`）が共有する。
 *
 * - `adminHost`: 環境変数 `ADMIN_HOST`（本番は `admin.assift.com`、開発で試すときは `admin.localhost:3000`）
 * - `production`: `VERCEL_ENV === 'production'`。`ADMIN_HOST` の設定漏れで本体と同じオリジンに開かないよう、本番では閉じる側に倒す
 */
export type AdminHostEnv = { adminHost: string | undefined; production: boolean }

/** proxy がすること。`pass` = そのまま通す */
export type AdminHostDecision = 'pass' | 'notFound' | 'redirectToAdmin'

export function adminHostEnv(): AdminHostEnv {
  return {
    adminHost: process.env.ADMIN_HOST?.trim().toLowerCase() || undefined,
    production: process.env.VERCEL_ENV === 'production',
  }
}

function normalizeHost(host: string | null): string | null {
  return host ? host.trim().toLowerCase() : null
}

/**
 * 管理画面を開いてよいホストか。`ADMIN_HOST` が無ければ、本番以外（プレビュー・開発）はどのホストでも開く
 * （プレビューはホストを 1 つしか持てない）
 */
export function isAdminHost(host: string | null, env: AdminHostEnv): boolean {
  if (!env.adminHost) return !env.production
  return normalizeHost(host) === env.adminHost
}

/**
 * | 状況                                   | 管理画面のパス | それ以外             |
 * | -------------------------------------- | -------------- | -------------------- |
 * | 管理画面のホスト（ADMIN_HOST と一致）  | 通す           | 管理画面へ redirect  |
 * | 本体のホスト（ADMIN_HOST と違う）      | 404            | 通す                 |
 * | ADMIN_HOST が無い・本番でない          | 通す           | 通す                 |
 * | ADMIN_HOST が無い・本番                | 404            | 通す                 |
 */
export function adminHostDecision(
  host: string | null,
  pathname: string,
  env: AdminHostEnv
): AdminHostDecision {
  const adminPath = isAdminPath(pathname)
  if (env.adminHost && normalizeHost(host) === env.adminHost) {
    return adminPath ? 'pass' : 'redirectToAdmin'
  }
  if (!adminPath) return 'pass'
  return isAdminHost(host, env) ? 'pass' : 'notFound'
}
