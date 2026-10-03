/**
 * 制約ページの 2 群（013 §4.1）。純関数。
 *
 * - 店舗全体（`staff_id` が null）は登録順（渡された順）のまま
 * - スタッフ別は人ごとにまとめ、人の並びはスタッフ一覧の並び（在籍 → 退職済み。どちらも `position` 順で渡す）。
 *   人の中の並びは登録順。規則の無い人は出さない
 */

type RestrictionRow = { id: string; staff_id: string | null }
type StaffRow = { id: string; name: string }

export type StaffRestrictionGroup<R> = {
  staff: StaffRow
  retired: boolean
  restrictions: R[]
}

export function groupRestrictions<R extends RestrictionRow>(
  restrictions: readonly R[],
  activeStaffs: readonly StaffRow[],
  retiredStaffs: readonly StaffRow[]
): { tenantWide: R[]; byStaff: StaffRestrictionGroup<R>[]; byStaffCount: number } {
  const tenantWide: R[] = []
  const byStaffId = new Map<string, R[]>()
  for (const restriction of restrictions) {
    if (restriction.staff_id === null) {
      tenantWide.push(restriction)
      continue
    }
    const list = byStaffId.get(restriction.staff_id)
    if (list) list.push(restriction)
    else byStaffId.set(restriction.staff_id, [restriction])
  }

  const byStaff: StaffRestrictionGroup<R>[] = []
  const add = (staffs: readonly StaffRow[], retired: boolean) => {
    for (const staff of staffs) {
      const list = byStaffId.get(staff.id)
      if (list)
        byStaff.push({ staff: { id: staff.id, name: staff.name }, retired, restrictions: list })
    }
  }
  add(activeStaffs, false)
  add(retiredStaffs, true)

  return {
    tenantWide,
    byStaff,
    byStaffCount: byStaff.reduce((sum, group) => sum + group.restrictions.length, 0),
  }
}
