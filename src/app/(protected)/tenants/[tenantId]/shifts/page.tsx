import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { dateRange, defaultStart } from '@/lib/calendar/dateRange'
import { holidaysIn } from '@/lib/calendar/holidays'
import { todayJst } from '@/lib/calendar/today'
import { parseRequiredNums } from '@/lib/patterns/requiredNums'
import { listDateNotes } from '@/lib/queries/dateNotes'
import { listPatterns } from '@/lib/queries/patterns'
import { listRequiredNums } from '@/lib/queries/requiredNums'
import { listShifts } from '@/lib/queries/shifts'
import { listActiveStaffsWithPatternIds } from '@/lib/queries/staffs'
import { getTenant } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'
import { ShiftsClient } from './_components/ShiftsClient'
import { loadShiftsSearchParams } from './searchParams'

export const metadata: Metadata = { title: 'シフト表' }

export default async function ShiftsPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]/shifts'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  const [{ start }, tenant] = await Promise.all([
    loadShiftsSearchParams(searchParams),
    getTenant(tenantId),
  ])
  if (!tenant) notFound()

  // 不正な ?start= は parser が null にするので、JST 今日の月初に落とす（007 §3.1）
  const requestedStart = start ?? defaultStart(todayJst())
  const range = dateRange(tenant.shift_cycle, tenant.start_of_week, requestedStart)

  const [staffs, patterns, shiftRows, requiredNums, dateNotes] = await Promise.all([
    listActiveStaffsWithPatternIds(tenantId),
    listPatterns(tenantId),
    listShifts(tenantId, range.start, range.end),
    listRequiredNums(tenantId, range.start, range.end),
    listDateNotes(tenantId, range.start, range.end),
  ])

  // 退職者の行はクエリではなくここで落とす（007 §5.8）
  const activeStaffIds = new Set(staffs.map((staff) => staff.id))

  return (
    <ShiftsClient
      tenantId={tenantId}
      cycle={tenant.shift_cycle}
      startOfWeek={tenant.start_of_week}
      start={requestedStart}
      holidays={holidaysIn(range.dates)}
      staffs={staffs.map((staff) => ({
        id: staff.id,
        name: staff.name,
        availableWdays: staff.available_wdays,
        patternIds: staff.patternIds,
      }))}
      patterns={patterns.map((pattern) => ({
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        colorHex: pattern.color_hex,
        kind: pattern.kind,
        pairPatternId: pattern.pair_pattern_id,
        // jsonb はアプリ層の型に直してから Client に渡す（006 §3.9）
        defaultRequiredNums: parseRequiredNums(pattern.default_required_nums),
      }))}
      shifts={shiftRows.filter((shift) => activeStaffIds.has(shift.staffId))}
      requiredNums={requiredNums}
      dateNotes={dateNotes}
    />
  )
}
