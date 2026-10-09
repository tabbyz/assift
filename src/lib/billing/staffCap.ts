import { STAFF_CAP_MAX, STAFF_CAP_MIN } from '@/lib/validation/billing'

/** 最初に入っている値の刻みと最小（019 §13.2-4） */
const STEP = 5
const SUGGESTED_MIN = 15

/**
 * 上限の入力に最初に入れておく値: 在籍数より大きい次の 5 の倍数（最小 15）。8 → 15、12 → 15、15 → 20、23 → 25。
 * 余裕は常に 1〜5 人（ちょうど 5 の倍数のときに余裕 0 にしない）。1000 を超えるなら 1000
 */
export function suggestedStaffCap(activeStaffCount: number): number {
  const next = (Math.floor(Math.max(0, activeStaffCount) / STEP) + 1) * STEP
  return Math.min(STAFF_CAP_MAX, Math.max(SUGGESTED_MIN, next))
}

/** 選べる下限: max(在籍数, 11)。在籍数より下にすると、足すことも下げることもできなくなる */
export function minStaffCap(activeStaffCount: number): number {
  return Math.max(activeStaffCount, STAFF_CAP_MIN)
}
