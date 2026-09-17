import { getV1UuidNamespace, v1Uuid } from '@/lib/migration/v1Ids'
import { lookup } from '@/utils/record'

/**
 * v1 の店舗 URL（22 文字トークン）を v2 の uuid URL に書き換える（005 §3.1）。
 *
 * v1: `/tenants/JuFZPcSXmXOaVvCmbb1JVw/shifts?start_date=2026-10-01`
 * v2: `/tenants/<uuid>/shifts?start=2026-10-01`
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
 * @param namespace uuid v5 の名前空間（RFC 準拠の uuid）
 */
export function rewriteLegacyTenantUrl(
  pathname: string,
  search: string,
  namespace: string
): RewrittenUrl | null {
  const matched = LEGACY_TENANT_PATH.exec(pathname)
  if (!matched) return null

  const [, token, rest] = matched
  const tenantId = v1Uuid('tenants', token, namespace)
  const nextSearch = rewriteSearch(search)

  // `/tenants/<token>/shifts.pdf` → `/api/tenants/<uuid>/shifts/pdf`（着地は 010）。
  // URL 由来のキーなので lookup() 経由で引く（素の添字だと `constructor` などが
  // プロトタイプ上の値を返し、でたらめなパスへリダイレクトしてしまう）
  const exportKind = lookup(EXPORT_PATHS, rest)
  if (exportKind) {
    return { pathname: `/api/tenants/${tenantId}/shifts/${exportKind}`, search: nextSearch }
  }

  const suffix = rest ? `/${rest}` : ''
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

/**
 * proxy から使う入口。env の名前空間が無ければ書き換えない（旧 URL はそのまま 404 になる）。
 * 名前空間が RFC 非準拠だと `v1Uuid` が例外を投げるので、`getV1UuidNamespace()` で先に弾く。
 */
export function resolveLegacyTenantUrl(pathname: string, search: string): RewrittenUrl | null {
  const namespace = getV1UuidNamespace()
  if (!namespace) {
    warnMissingNamespace(pathname)
    return null
  }
  return rewriteLegacyTenantUrl(pathname, search, namespace)
}

let warned = false

/** 旧 URL が来たのに解決できないときだけ、プロセスに一度だけ警告する */
function warnMissingNamespace(pathname: string) {
  if (warned || !LEGACY_TENANT_PATH.test(pathname)) return
  warned = true
  console.warn(
    '[tenants] V1_UUID_NAMESPACE が未設定か uuid 形式ではないため、v1 の店舗 URL を解決できません'
  )
}
