import type { Tables } from '@/types/database'

type RestrictionForWarning = Pick<Tables<'restrictions'>, 'kind' | 'days' | 'staff_id'>
type StaffForWarning = Pick<Tables<'staffs'>, 'id' | 'max_work_week' | 'available_wdays'>

/**
 * 明らかに守れない下限の注意（013 §3.5）。自動アサインはこの人・この週だけソフトとして扱うので、保存は止めない。
 *
 * 週の最低勤務日数が、その人の「週の最大勤務日数」か「勤務できる曜日の数」を超えるとき。
 * 店舗全体の規則は在籍スタッフのうち当てはまる人数を出す。
 */
export function lowerBoundWarning(
  restriction: RestrictionForWarning,
  activeStaffs: readonly StaffForWarning[]
): string | null {
  if (restriction.kind !== 'min_work_week' || restriction.days === null) return null
  const days = restriction.days

  if (restriction.staff_id !== null) {
    const staff = activeStaffs.find((row) => row.id === restriction.staff_id)
    if (!staff) return null
    if (days > staff.max_work_week) {
      return `週の最大勤務日数（${staff.max_work_week}日）より多いため守れません`
    }
    const wdays = new Set(staff.available_wdays).size
    if (days > wdays) return `勤務できる曜日（${wdays}日）より多いため守れません`
    return null
  }

  const short = activeStaffs.filter(
    (staff) => days > Math.min(staff.max_work_week, new Set(staff.available_wdays).size)
  ).length
  return short > 0 ? `週の最大勤務日数か勤務できる曜日が足りない ${short} 人には守れません` : null
}
