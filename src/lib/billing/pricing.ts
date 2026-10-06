/**
 * 料金の規則（016）。在籍スタッフ 10 人までは無料、11 人目から 1 人あたり月 100 円。
 * LP の料金表示と計算スライダーが使う。課金の実装（Phase 2）もここを正にする。
 */

/** 無料で使える在籍スタッフの人数 */
export const FREE_STAFF_LIMIT = 10

/** 無料の人数を超えた 1 人あたりの月額（円） */
export const PRICE_PER_STAFF_YEN = 100

/** 無料の人数を超えた人数。0 人以下・小数は来ない前提だが、負にはしない */
export function billableStaffCount(staffCount: number): number {
  return Math.max(0, staffCount - FREE_STAFF_LIMIT)
}

/** 月額（円） */
export function monthlyPriceYen(staffCount: number): number {
  return billableStaffCount(staffCount) * PRICE_PER_STAFF_YEN
}
