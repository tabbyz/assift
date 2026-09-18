import { parseAsStringLiteral } from 'nuqs/server'

/** 在籍 / 退職の 2 タブ（v1 は /staffs/disabled の別 URL。006 §3.2） */
export const STAFF_TABS = ['active', 'retired'] as const

export type StaffTab = (typeof STAFF_TABS)[number]

/**
 * Server は在籍・退職の両方を読んで渡すので、タブの解決は Client だけで足りる。
 * そのため `createLoader` は置かない（page は searchParams を読まない）。
 */
export const staffsParsers = {
  tab: parseAsStringLiteral(STAFF_TABS).withDefault('active'),
}
