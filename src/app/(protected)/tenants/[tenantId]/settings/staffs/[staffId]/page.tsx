import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { getStaffWithRelations } from '@/lib/queries/staffs'
import { isUuid } from '@/utils/uuid'
import { RetiredStaffAlert } from '../_components/RetiredStaffAlert'
import { StaffEditClient } from '../_components/StaffEditClient'
import { StaffEditForms } from '../_components/StaffEditForms'

export const metadata: Metadata = { title: 'スタッフの編集' }

export default async function EditStaffPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/staffs/[staffId]'>) {
  const { tenantId, staffId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  if (!isUuid(staffId)) notFound()

  const [staff, patterns] = await Promise.all([
    getStaffWithRelations(tenantId, staffId),
    listPatterns(tenantId),
  ])
  if (!staff) notFound()

  const retired = staff.retired_at !== null

  return (
    <Stack gap="lg">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ一覧' }}
        current="スタッフの編集"
      />
      <Title order={2}>スタッフの編集</Title>

      {retired && <RetiredStaffAlert tenantId={tenantId} staffId={staff.id} />}

      <StaffEditForms
        tenantId={tenantId}
        staffId={staff.id}
        patterns={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))}
        initialName={staff.name}
        initialConditions={{
          availableWdays: staff.available_wdays,
          maxWorkWeek: staff.max_work_week,
          availablePatternIds: staff.patternIds,
          defaultPatterns: staff.defaultPatterns,
        }}
      />

      <StaffEditClient tenantId={tenantId} staffId={staff.id} retired={retired} />
    </Stack>
  )
}
