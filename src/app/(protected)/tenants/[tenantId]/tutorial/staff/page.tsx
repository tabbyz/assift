import { Alert, Stack, Text } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { listActiveStaffs } from '@/lib/queries/staffs'
import { StaffForm } from '../../settings/staffs/_components/StaffForm'

export default async function TutorialStaffPage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/staff'>) {
  const { tenantId } = await params
  const staffs = await listActiveStaffs(tenantId)

  return (
    <Stack gap="lg">
      <Alert color="teal" variant="light">
        {staffs.length === 0 ? (
          <Text>続けてスタッフを登録しましょう。</Text>
        ) : (
          <Stack gap="xs" align="flex-start">
            <Text size="sm">登録済みのスタッフ（あとで編集できます）</Text>
            <Text fw={700}>{staffs.map((staff) => staff.name).join('、')}</Text>
            <Text size="sm">ひと通り追加したら初期設定は完了です。</Text>
            <LinkButton href={`/tenants/${tenantId}/tutorial/complete`} color="teal" mt="xs">
              初期設定を完了する
            </LinkButton>
          </Stack>
        )}
      </Alert>

      <StaffForm tenantId={tenantId} />
    </Stack>
  )
}
