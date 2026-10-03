import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { countTenantWideRestrictions, listStaffRestrictions } from '@/lib/queries/restrictions'
import { getStaffWithRelations } from '@/lib/queries/staffs'
import { getTenant } from '@/lib/queries/tenants'
import { toRestrictionRowView } from '@/lib/restrictions/rowView'
import { isUuid } from '@/utils/uuid'
import { RetiredStaffAlert } from '../_components/RetiredStaffAlert'
import { StaffEditClient } from '../_components/StaffEditClient'
import { StaffForm } from '../_components/StaffForm'
import { StaffRestrictionsPanel } from '../_components/StaffRestrictionsPanel'

export const metadata: Metadata = { title: 'スタッフの編集' }

export default async function EditStaffPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/staffs/[staffId]'>) {
  const { tenantId, staffId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  if (!isUuid(staffId)) notFound()

  const [tenant, staff, patterns, restrictions, tenantWideCount] = await Promise.all([
    getTenant(tenantId),
    getStaffWithRelations(tenantId, staffId),
    listPatterns(tenantId),
    listStaffRestrictions(tenantId, staffId),
    countTenantWideRestrictions(tenantId),
  ])
  if (!tenant || !staff) notFound()

  const retired = staff.retired_at !== null
  const patternNames = new Map(patterns.map((pattern) => [pattern.id, pattern.name]))

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ一覧' }}
        current="スタッフの編集"
      />
      <Title order={2}>スタッフの編集</Title>

      {retired && <RetiredStaffAlert tenantId={tenantId} staffId={staff.id} />}

      <StaffForm
        tenantId={tenantId}
        patterns={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))}
        initial={{
          staffId: staff.id,
          name: staff.name,
          availableWdays: staff.available_wdays,
          maxWorkWeek: staff.max_work_week,
          availablePatternIds: staff.patternIds,
          defaultPatterns: staff.defaultPatterns,
        }}
        afterCreate="list"
      />

      <StaffRestrictionsPanel
        tenantId={tenantId}
        staffId={staff.id}
        rows={restrictions.map((restriction) =>
          toRestrictionRowView(restriction, {
            tenantId,
            patternNames,
            cycle: tenant.shift_cycle,
            // 注意（守れない下限）は保存済みの値で見る。フォームを編集中の値ではない
            activeStaffs: retired ? [] : [staff],
            from: 'staff',
          })
        )}
        tenantWideCount={tenantWideCount}
        retired={retired}
      />

      <StaffEditClient tenantId={tenantId} staffId={staff.id} retired={retired} />
    </Stack>
  )
}
