import 'server-only'
import type { DateRange } from '@/lib/calendar/dateRange'
import { holidaysIn } from '@/lib/calendar/holidays'
import type { ShiftTable } from '@/lib/shifts/table'
import type { Tenant } from './tenants'
import { listDateNotes } from './dateNotes'
import { listPatterns } from './patterns'
import { listShifts } from './shifts'
import { listActiveStaffs } from './staffs'

/**
 * エクスポート（PDF / CSV）が読む表（010 §3.3）。既存のクエリを合成するだけで、SQL は増やさない。
 *
 * **`createClient()`（anon + RLS）を使う。** 009 の `publicShare.ts` が service_role なのは
 * 「未ログインで開く公開ページには RLS が使えない」からで、ここはログイン済みのユーザー文脈なので
 * 例外を増やす理由が無い（AGENTS.md「RLS を通らない読み取りは publicShare.ts だけ」）。
 *
 * **`tenantId` ではなく `tenant` を受ける**（§8.12 G2）。`tenantName` の出どころを隠さないため。
 * 呼び出し元（`loadShiftExport`）は `getTenant()` の結果を既に持っている。
 */
export async function getShiftTable(tenant: Tenant, range: DateRange): Promise<ShiftTable> {
  const [staffs, patterns, shifts, notes] = await Promise.all([
    listActiveStaffs(tenant.id),
    listPatterns(tenant.id),
    listShifts(tenant.id, range.start, range.end),
    listDateNotes(tenant.id, range.start, range.end),
  ])

  // 退職者の行はクエリではなくここで落とす（`.in('staff_id', ids)` は URL に uuid が並ぶ。007 §5.8）
  const activeStaffIds = new Set(staffs.map((staff) => staff.id))

  return {
    tenantName: tenant.name,
    start: range.start,
    end: range.end,
    dates: range.dates,
    holidays: holidaysIn(range.dates),
    staffs: staffs.map((staff) => ({ id: staff.id, name: staff.name })),
    patterns: patterns.map((pattern) => ({
      id: pattern.id,
      name: pattern.name,
      description: pattern.description,
      colorHex: pattern.color_hex,
    })),
    shifts: shifts.filter((shift) => activeStaffIds.has(shift.staffId)),
    notes,
  }
}
