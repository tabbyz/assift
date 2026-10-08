import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { dateRange, defaultStart } from '@/lib/calendar/dateRange'
import { holidaysIn } from '@/lib/calendar/holidays'
import { todayJst } from '@/lib/calendar/today'
import { isAssistAvailable } from '@/lib/assist/llm/client'
import { requestOrigin } from '@/lib/auth/requestOrigin'
import { parseRequiredNums } from '@/lib/patterns/requiredNums'
import { getLatestAssistRun } from '@/lib/queries/assistRuns'
import { listDateNotes } from '@/lib/queries/dateNotes'
import { listPatterns } from '@/lib/queries/patterns'
import { listRequiredNums } from '@/lib/queries/requiredNums'
import { listRestrictions } from '@/lib/queries/restrictions'
import { listShares, type ShareRow } from '@/lib/queries/shares'
import { listShifts } from '@/lib/queries/shifts'
import { listActiveStaffsWithPatternIds } from '@/lib/queries/staffs'
import { getCurrentBillingOverview } from '@/lib/queries/billing'
import { getTenant } from '@/lib/queries/tenants'
import { StaffLimitLock } from '@/components/billing/StaffLimitLock'
import { isUuid } from '@/utils/uuid'
import type { ShareItem } from './_components/ShareModal'
import { ShiftsClient } from './_components/ShiftsClient'
import { loadShiftsSearchParams } from './searchParams'

export const metadata: Metadata = { title: 'シフト表' }

export default async function ShiftsPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  const [{ start }, tenant] = await Promise.all([
    loadShiftsSearchParams(searchParams),
    getTenant(tenantId),
  ])
  if (!tenant) notFound()
  // 準備中の店舗は初期設定の続きへ（014 §3.7）
  if (!tenant.setup_completed_at) redirect(`/tenants/${tenantId}/setup`)

  // 共有の公開期限も同じ「今日」で判定する（Client に渡して発行ボタンの可否にも使う。009 §3.2）
  const today = todayJst()
  // 不正な ?start= は parser が null にするので、JST 今日の月初に落とす（007 §3.1）
  const requestedStart = start ?? defaultStart(today)
  const range = dateRange(tenant.shift_cycle, tenant.start_of_week, requestedStart)

  const [
    staffs,
    patterns,
    shiftRows,
    requiredNums,
    dateNotes,
    shares,
    origin,
    restrictions,
    latestAssist,
    billing,
  ] = await Promise.all([
    listActiveStaffsWithPatternIds(tenantId),
    listPatterns(tenantId),
    listShifts(tenantId, range.start, range.end),
    listRequiredNums(tenantId, range.start, range.end),
    listDateNotes(tenantId, range.start, range.end),
    listShares(tenantId, today),
    requestOrigin(),
    // 自動アサイン（012 §4.2）。表の描画には使わず、モーダルの「制約 n 件」だけに使う
    listRestrictions(tenantId),
    getLatestAssistRun(tenantId, range.start, range.end),
    // 在籍が上限を超えていたら表をロックする（019 §5.4）。未ログインは layout が弾く
    getCurrentBillingOverview(),
  ])

  // 共有 URL はクエリではなくここで組む（クエリは DB の列だけを返す。009 §5.3）
  const toShareItem = (share: ShareRow): ShareItem => ({
    id: share.id,
    url: `${origin}/share/${share.code}`,
    startDate: share.startDate,
    endDate: share.endDate,
    createdAt: share.createdAt,
  })

  // 退職者の行はクエリではなくここで落とす（007 §5.8）
  const activeStaffIds = new Set(staffs.map((staff) => staff.id))

  const table = (
    <ShiftsClient
      tenantId={tenantId}
      cycle={tenant.shift_cycle}
      startOfWeek={tenant.start_of_week}
      start={requestedStart}
      today={today}
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
      requiredOverrides={requiredNums}
      dateNotes={dateNotes}
      shares={{
        enabled: shares.enabled.map(toShareItem),
        expired: shares.expired.map(toShareItem),
      }}
      assist={{
        available: isAssistAvailable(),
        notes: tenant.assist_notes ?? '',
        restrictionCount: restrictions.length,
        latest: latestAssist,
      }}
    />
  )

  if (billing?.overLimit && billing.limit !== null) {
    return (
      <StaffLimitLock
        tenantId={tenantId}
        limit={billing.limit}
        manual={billing.entitlement.kind === 'manual'}
        trialAvailable={billing.trialAvailable}
      >
        {table}
      </StaffLimitLock>
    )
  }
  return table
}
