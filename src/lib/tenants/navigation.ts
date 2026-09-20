/** ヘッダーと設定ナビで共有する、テナント配下のリンク定義（005 §3.5） */

export type TenantLink = {
  href: string
  label: string
}

/** モバイルのメニュー。デスクトップのヘッダーには出さない */
export function primaryLinks(tenantId: string): TenantLink[] {
  return [{ href: shiftsHref(tenantId), label: 'シフト表' }]
}

/** 運用で触るマスタ。設定の先頭 */
export function masterLinks(tenantId: string): TenantLink[] {
  return [
    { href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ' },
    { href: `/tenants/${tenantId}/settings/patterns`, label: '勤務パターン' },
  ]
}

/** マスタより下。店舗情報は末尾（名前・周期・削除で、いちばん触らない） */
export function configLinks(tenantId: string): TenantLink[] {
  return [
    { href: `/tenants/${tenantId}/settings/restrictions`, label: '自動アサイン制約' },
    { href: `/tenants/${tenantId}/settings/general`, label: '店舗情報' },
  ]
}

/** ヘッダーの「設定」。いちばんよく開くスタッフ一覧へ入る */
export function settingsHref(tenantId: string) {
  return `/tenants/${tenantId}/settings/staffs`
}

export function shiftsHref(tenantId: string) {
  return `/tenants/${tenantId}/shifts`
}

export function isShiftsPath(pathname: string): boolean {
  return pathname.includes('/shifts')
}

export function isSettingsPath(pathname: string): boolean {
  return pathname.includes('/settings/')
}

/** 一覧の編集・新規も親を現在地にする。兄弟パスは含めない */
export function isLinkActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
