import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Group, Stack, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { StaffLimitAlert } from '@/components/billing/StaffLimitAlert'
import { getCurrentBillingOverview } from '@/lib/queries/billing'
import { listActiveStaffs, listRetiredStaffs } from '@/lib/queries/staffs'
import { isUuid } from '@/utils/uuid'
import { StaffListClient } from './_components/StaffListClient'

export const metadata: Metadata = { title: 'スタッフ' }

export default async function StaffsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/staffs'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  // 両タブとも Server で読み、切替は shallow にする（006 §3.2）
  const [activeStaffs, retiredStaffs, billing] = await Promise.all([
    listActiveStaffs(tenantId),
    listRetiredStaffs(tenantId),
    getCurrentBillingOverview(),
  ])
  // 上限（全店舗の合計）に達したら案内する（019 §5.4）。追加ボタンは押せるまま（押したら案内のモーダル）
  const atLimit = billing?.limit != null && billing.activeStaffCount >= billing.limit

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>スタッフ</Title>
        <LinkButton
          href={`/tenants/${tenantId}/settings/staffs/new`}
          size="sm"
          leftSection={<IconPlus size={16} />}
        >
          追加
        </LinkButton>
      </Group>

      {atLimit && billing?.limit != null && (
        <StaffLimitAlert
          limit={billing.limit}
          manual={billing.entitlement.kind === 'manual'}
          trialAvailable={billing.trialAvailable}
        />
      )}

      <StaffListClient
        tenantId={tenantId}
        activeStaffs={activeStaffs}
        retiredStaffs={retiredStaffs}
      />
    </Stack>
  )
}
