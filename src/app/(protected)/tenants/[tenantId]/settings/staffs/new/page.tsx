import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { StaffForm } from '../_components/StaffForm'

export const metadata: Metadata = { title: 'スタッフの追加' }

export default async function NewStaffPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/staffs/new'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const patterns = await listPatterns(tenantId)

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/staffs`, label: 'スタッフ一覧' }}
        current="スタッフの追加"
      />
      <Title order={2}>スタッフの追加</Title>

      <StaffForm
        tenantId={tenantId}
        patterns={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))}
        afterCreate="list"
      />
    </Stack>
  )
}
