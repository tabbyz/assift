/**
 * 料金の規則（016・019）。在籍スタッフ 10 人までは無料、11 人目から 1 人あたり月 100 円。
 * LP の料金表示と計算スライダー、課金の画面が使う。Stripe の price（graduated tiers）と一致させる（019 §4.1）。
 */

/** 無料で使える在籍スタッフの人数 */
export const FREE_STAFF_LIMIT = 10

/** 無料の人数を超えた 1 人あたりの月額（円） */
export const PRICE_PER_STAFF_YEN = 100

/** 旧料金（v1 からの継続）のクーポンの割引率（%）。100 円の 50% 引きで v1 の 1 人 50 円になる（019 §2.4） */
export const LEGACY_DISCOUNT_PERCENT = 50

/** 無料の人数を超えた人数。0 人以下・小数は来ない前提だが、負にはしない */
export function billableStaffCount(staffCount: number): number {
  return Math.max(0, staffCount - FREE_STAFF_LIMIT)
}

/**
 * 月額（円）。`discountPercent` は旧料金のクーポン（Stripe と同じく小計に掛け、1 円未満は切り捨てる）。
 * 在籍数は「その請求期間の最大人数」を渡す
 */
export function monthlyPriceYen(staffCount: number, discountPercent = 0): number {
  const subtotal = billableStaffCount(staffCount) * PRICE_PER_STAFF_YEN
  return Math.floor((subtotal * (100 - discountPercent)) / 100)
}
