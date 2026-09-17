import { isUuid } from '@/utils/uuid'

/**
 * 直近に開いた店舗の記憶（005 §3.3。v1 の cookie `current_tenant` 相当）。
 *
 * Server Component は cookie を書けないので、記録は proxy が行う。
 * 「そのユーザーの店舗か」は proxy では判定せず、`/tenants` が RLS 越しの一覧と突き合わせる。
 */

export const CURRENT_TENANT_COOKIE = 'assift-current-tenant'

/** v1 は 7 日。1 週間ぶりに開いた人を別の店舗に着地させる理由が無いので 30 日にする */
export const CURRENT_TENANT_MAX_AGE = 60 * 60 * 24 * 30

/**
 * `/tenants/<uuid>` とその配下なら店舗 id を返す。それ以外は null。
 *
 * Postgres は大文字の uuid も受けて小文字で返すので、URL に大文字が来ても
 * 小文字にそろえてから記録する（そのままだと DB 由来の id と `===` で一致しない）。
 */
export function tenantIdFromPathname(pathname: string): string | null {
  const matched = /^\/tenants\/([^/]+)(?:\/|$)/.exec(pathname)
  const id = matched?.[1]
  return isUuid(id) ? id.toLowerCase() : null
}

/**
 * 開く店舗を決める。cookie の店舗が一覧にあればそれ、無ければ末尾。
 * 末尾なのは v1 の `@tenants.last`（作成順の最後）に合わせるため。
 */
export function pickTenantToOpen<T extends { id: string }>(
  tenants: readonly T[],
  cookieId: string | null | undefined
): T | null {
  if (tenants.length === 0) return null
  // cookie は古い版が大文字で書いている可能性があるので、比較も大小を無視する
  const wanted = isUuid(cookieId) ? cookieId.toLowerCase() : null
  const remembered = wanted
    ? tenants.find((tenant) => tenant.id.toLowerCase() === wanted)
    : undefined
  return remembered ?? tenants[tenants.length - 1]
}
