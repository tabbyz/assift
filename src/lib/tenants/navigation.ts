/** ヘッダーと設定ナビで共有する、テナント配下のリンク定義（005 §3.5） */

export type TenantLink = {
  href: string
  label: string
}

/** 基本設定（v1 navbar の「基本設定」） */
export function settingsLinks(tenantId: string): TenantLink[] {
  return [
    { href: `/tenants/${tenantId}/settings/general`, label: '店舗情報' },
    { href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ' },
    { href: `/tenants/${tenantId}/settings/patterns`, label: '勤務パターン' },
  ]
}

/** アサイン設定（v1 navbar の「アサイン設定」） */
export function assignLinks(tenantId: string): TenantLink[] {
  return [{ href: `/tenants/${tenantId}/settings/restrictions`, label: '自動アサイン制約' }]
}

export function shiftsHref(tenantId: string) {
  return `/tenants/${tenantId}/shifts`
}
