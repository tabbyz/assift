/** ヘッダーと設定ナビで共有する、テナント配下のリンク定義（005 §3.5） */

export type TenantLink = {
  href: string
  label: string
  /**
   * 着地するページがまだ無い（006 で実装する）。
   * Next は画面内の Link を先読みするので、そのままだと表示のたびに 404 の
   * RSC リクエストが飛んで console にエラーが出る。該当リンクだけ先読みを切る。
   * 006 でページを作ったらこのフラグを外す。
   */
  pending?: true
}

/** 基本設定（v1 navbar の「基本設定」） */
export function settingsLinks(tenantId: string): TenantLink[] {
  return [
    { href: `/tenants/${tenantId}/settings/general`, label: '店舗情報' },
    { href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ', pending: true },
    { href: `/tenants/${tenantId}/settings/patterns`, label: '勤務パターン', pending: true },
  ]
}

/** アサイン設定（v1 navbar の「アサイン設定」） */
export function assignLinks(tenantId: string): TenantLink[] {
  return [
    {
      href: `/tenants/${tenantId}/settings/restrictions`,
      label: '自動アサイン制約',
      pending: true,
    },
  ]
}

export function shiftsHref(tenantId: string) {
  return `/tenants/${tenantId}/shifts`
}
