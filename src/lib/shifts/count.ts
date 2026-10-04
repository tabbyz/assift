import type { ShiftMap } from './key'

/** スタッフ 1 人分の集計（v1 `shifts/_count.html.slim` の 1 行）。`staff` は呼び出し側が渡したものをそのまま返す */
export type StaffCount<S> = {
  staff: S
  /** 出勤日（`kind = 'workday'`）のパターンがアサインされた日数 */
  workdays: number
  /** パターン id → 件数。0 件のパターンはキーを持たない（表示側で空欄にする） */
  byPattern: Map<string, number>
}

/**
 * アサイン数の集計（v1 `ShiftsController#count`）。
 *
 * **サーバーを呼ばず、画面が持っているシフトから数える**（008 §3.7 / 001 §4.4）。
 * v1 は別リクエストで DB を読んでいたので、アサインの Ajax 中に開くと表とずれた。
 *
 * 戻り値は `staffs` と同じ順・同じ長さ（0 件のスタッフも行を持つ）で、各行が元の `staff` を抱える。
 * 母集団は表示中の在籍スタッフ（`shifts` は page.tsx が在籍者で絞ってある。007 §3.11）。
 *
 * **期間で絞ってから数える。** 楽観更新の `applyAssign()` はペアのシフトを翌日に置くので、
 * 期間の最終日に夜勤をアサインすると、Client の `ShiftMap` には期間外（`end + 1`）の「明け」が入る。
 */
export function countShifts<S extends { id: string }>(
  shifts: ShiftMap,
  staffs: readonly S[],
  workdayPatternIds: ReadonlySet<string>,
  dates: readonly string[]
): StaffCount<S>[] {
  const rows = staffs.map((staff): StaffCount<S> => ({ staff, workdays: 0, byPattern: new Map() }))
  const byStaffId = new Map(rows.map((row) => [row.staff.id, row]))
  const inRange = new Set(dates)

  for (const shift of shifts.values()) {
    const row = byStaffId.get(shift.staffId)
    // 退職者など staffs に無いスタッフの行は数えない
    if (!row || !inRange.has(shift.date)) continue

    row.byPattern.set(shift.patternId, (row.byPattern.get(shift.patternId) ?? 0) + 1)
    if (workdayPatternIds.has(shift.patternId)) row.workdays += 1
  }

  return rows
}
