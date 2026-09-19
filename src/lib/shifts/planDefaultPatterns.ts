import { dayKeyFor, type DayKey } from '@/lib/calendar/weekdays'

/** デフォルト勤務パターンの計画に必要な最小限（`staffs` の全列は要らない） */
export type StaffDefaults = { id: string; defaults: Partial<Record<DayKey, string>> }

/** INSERT する 1 行（`fixed` は Action が下書き = false で入れる） */
export type PlannedShift = { staffId: string; date: string; patternId: string }

/**
 * スタッフのデフォルト勤務パターンを期間分の行に広げる（v1 `ShiftsController#set_default`。008 §3.5）。
 *
 * v1 の規則をそのまま保つ:
 * - 祝日は曜日より優先（`dayKeyFor`）
 * - 選択可能な勤務パターン（`staff_patterns`）や勤務できる曜日（`available_wdays`）では**絞らない**
 * - ペア（夜勤 → 明け）は張らない
 *
 * 「アサイン済みの日は上書きしない」は呼び出し側の `ON CONFLICT DO NOTHING` が担う（008 §3.2）。
 * 祝日かどうかの判定は Server から渡す（祝日データは Server だけが持つ。007 §3.8）。
 */
export function planDefaultPatterns(
  staffs: StaffDefaults[],
  dates: string[],
  holidays: Set<string>
): PlannedShift[] {
  const rows: PlannedShift[] = []

  for (const staff of staffs) {
    for (const date of dates) {
      const patternId = staff.defaults[dayKeyFor(date, holidays.has(date))]
      if (patternId) rows.push({ staffId: staff.id, date, patternId })
    }
  }

  return rows
}
