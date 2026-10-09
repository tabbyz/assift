import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Group, Stack, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { StaffLimitAlert } from '@/components/billing/StaffLimitAlert'
import { getConfirmablePeriodPeak, getCurrentBillingOverview } from '@/lib/queries/billing'
import { listActiveStaffs, listRetiredStaffs } from '@/lib/queries/staffs'
import { getAuthUser } from '@/utils/auth/current'
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
  // 上限（全店舗の合計）に達したら案内する（019 §5.4）。追加ボタンは押せるまま（押したら案内のモーダル）。
  // 有料プランは上限人数を常に出す（§13.4）。最大人数は履歴を読むので、有料のときだけこのページで読む
  const atLimit = billing?.limit != null && billing.activeStaffCount >= billing.limit
  const paid = billing?.entitlement.kind === 'subscription' ? billing : null
  const user = paid ? await getAuthUser() : null
  const periodPeak = paid && user ? await readPeriodPeak(user.id, paid) : null

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

      {paid && paid.limit !== null ? (
        <StaffLimitAlert
          kind="subscription"
          limit={paid.limit}
          activeStaffCount={paid.activeStaffCount}
          periodPeak={periodPeak}
          discountPercent={paid.subscription?.discount_percent ?? 0}
        />
      ) : (
        atLimit &&
        billing?.limit != null &&
        billing.entitlement.kind !== 'subscription' && (
          <StaffLimitAlert
            kind={billing.entitlement.kind === 'manual' ? 'manual' : 'free'}
            limit={billing.limit}
            trialAvailable={billing.trialAvailable}
          />
        )
      )}

      <StaffListClient
        tenantId={tenantId}
        activeStaffs={activeStaffs}
        retiredStaffs={retiredStaffs}
      />
    </Stack>
  )
}

/** 料金の見込みの読み取りに失敗しても一覧は出す（案内の 1 行が減るだけ） */
async function readPeriodPeak(
  userId: string,
  billing: NonNullable<Awaited<ReturnType<typeof getCurrentBillingOverview>>>
): Promise<number | null> {
  try {
    return await getConfirmablePeriodPeak(userId, billing)
  } catch (error) {
    console.error('[billing] 今の期間の最大人数を読めませんでした', error)
    return null
  }
}
