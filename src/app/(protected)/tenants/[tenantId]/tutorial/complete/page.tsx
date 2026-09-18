import { notFound, redirect } from 'next/navigation'
import { Paper, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { getTutorialStatus } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'

export default async function TutorialCompletePage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/complete'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を throw する（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  // URL を直接開かれても、条件を満たしていなければ足りないステップへ戻す
  const { hasPattern, hasActiveStaff } = await getTutorialStatus(tenantId)
  if (!hasPattern) redirect(`/tenants/${tenantId}/tutorial/pattern`)
  if (!hasActiveStaff) redirect(`/tenants/${tenantId}/tutorial/staff`)

  return (
    <Paper withBorder p="xl">
      <Stack gap="md" align="center">
        <Title order={3}>お疲れさまでした。</Title>
        <Text ta="center">assiftを利用する準備が整いました。</Text>
        <Text ta="center" c="dimmed">
          今まで行なった設定は、画面右上のメニューからいつでも変更できます。
        </Text>
        <Text ta="center">それでは早速シフト表を作成してみましょう！</Text>
        <LinkButton href={`/tenants/${tenantId}/shifts`} size="md" mt="sm">
          シフト表を作成する
        </LinkButton>
      </Stack>
    </Paper>
  )
}
