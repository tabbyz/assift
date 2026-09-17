import { Paper, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'

export default async function TutorialIntroPage({
  params,
}: PageProps<'/tenants/[tenantId]/tutorial/intro'>) {
  const { tenantId } = await params

  return (
    <Paper withBorder p="xl">
      <Stack gap="md" align="center">
        <Title order={3}>初期設定</Title>
        <Text ta="center">シフト表を作成する前に、いくつかの設定を行う必要があります。</Text>
        <Text ta="center" c="dimmed">
          これらの設定はあとで変更できますので、まずは基本的な情報だけ登録して、初期設定を完了させてください。
        </Text>
        <LinkButton href={`/tenants/${tenantId}/tutorial/pattern`} size="md" mt="sm">
          はじめる
        </LinkButton>
      </Stack>
    </Paper>
  )
}
