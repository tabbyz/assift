import { v1Uuid } from '@/lib/migration/v1Ids'
import { lookup } from '@/utils/record'

/**
 * v1 の店舗 URL（22 文字トークン）を v2 の uuid URL に書き換える（005 §3.1）。
 *
 * v1: `/tenants/JuFZPcSXmXOaVvCmbb1JVw/shifts?start_date=2026-10-01`
 * v2: `/tenants/<uuid>?start=2026-10-01`（シフト表は店舗のトップ。005 §11）
 *
 * layout は配下のパスやクエリを知れないので、パスとクエリの両方を見られる proxy から使う。
 */

/**
 * `/tenants/<token>` と、その後ろの残り。
 * トークンは `SecureRandom.urlsafe_base64`（16 バイト）が作る 22 文字で、uuid（36 文字）とは重ならない。
 */
const LEGACY_TENANT_PATH = /^\/tenants\/([A-Za-z0-9_-]{22})(?:\/(.*))?$/

/** v1 のエクスポートは `shifts.pdf` / `shifts.csv`。v2 は Route Handler なので別のパスになる */
const EXPORT_PATHS: Record<string, string> = {
  'shifts.pdf': 'pdf',
  'shifts.csv': 'csv',
}

export type RewrittenUrl = { pathname: string; search: string }

/**
 * 旧 URL なら書き換え後のパスとクエリを返し、そうでなければ null。
 *
 * @param pathname `/tenants/<token>/shifts` のような URL のパス部分
 * @param search `?start_date=2026-10-01` のようなクエリ（`?` 込み。空文字可）
 */
export function rewriteLegacyTenantUrl(pathname: string, search: string): RewrittenUrl | null {
  const matched = LEGACY_TENANT_PATH.exec(pathname)
  if (!matched) return null

  const [, token, rest] = matched
  const tenantId = v1Uuid('tenants', token)
  const nextSearch = rewriteSearch(search)

  // `/tenants/<token>/shifts.pdf` → `/api/tenants/<uuid>/shifts/pdf`（着地は 010）。
  // URL 由来のキーなので lookup() 経由で引く（素の添字だと `constructor` などが
  // プロトタイプ上の値を返し、でたらめなパスへリダイレクトしてしまう）
  const exportKind = lookup(EXPORT_PATHS, rest)
  if (exportKind) {
    return { pathname: `/api/tenants/${tenantId}/shifts/${exportKind}`, search: nextSearch }
  }

  // v1 のシフト表は `/shifts`。v2 は店舗のトップなので落とす（`/shifts` へ送ると redirect が 2 回になる）
  const suffix = rest && rest !== 'shifts' ? `/${rest}` : ''
  return { pathname: `/tenants/${tenantId}${suffix}`, search: nextSearch }
}

/** v1 の `start_date` を v2 の `start` に。他のクエリは順序ごと残す */
function rewriteSearch(search: string): string {
  if (!search) return ''

  const params = new URLSearchParams(search)
  if (!params.has('start_date')) return search

  const rewritten = new URLSearchParams()
  for (const [key, value] of params) {
    rewritten.append(key === 'start_date' ? 'start' : key, value)
  }
  return `?${rewritten.toString()}`
}
