import { notFound } from 'next/navigation'
import { Alert, Stack, Text } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { listPatterns } from '@/lib/queries/patterns'
import { listActiveStaffs } from '@/lib/queries/staffs'
import { isUuid } from '@/utils/uuid'
import { StaffForm } from '../../settings/staffs/_components/StaffForm'

export default async function TutorialStaffPage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/staff'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const [staffs, patterns] = await Promise.all([listActiveStaffs(tenantId), listPatterns(tenantId)])

  return (
    <Stack gap="lg">
      <Alert color="gray" variant="light">
        {staffs.length === 0 ? (
          <Text>続けてスタッフを登録しましょう。</Text>
        ) : (
          <Stack gap="xs" align="flex-start">
            <Text size="sm">登録済みのスタッフ（あとで編集できます）</Text>
            <Text fw={700}>{staffs.map((staff) => staff.name).join('、')}</Text>
            <Text size="sm">ひと通り追加したら初期設定は完了です。</Text>
            <LinkButton href={`/tenants/${tenantId}/tutorial/complete`} mt="xs">
              初期設定を完了する
            </LinkButton>
          </Stack>
        )}
      </Alert>

      {/* 設定画面と同じフォーム（006 §3.5） */}
      <StaffForm
        tenantId={tenantId}
        patterns={patterns.map((pattern) => ({ id: pattern.id, name: pattern.name }))}
        afterCreate="reset"
      />
    </Stack>
  )
}
