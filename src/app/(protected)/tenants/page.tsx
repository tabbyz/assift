import { Container, Group, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { getAuthUser } from '@/utils/auth/current'

// 仮ページ。005 で本実装（店舗一覧 + AppShell）に置き換える。アカウントへの導線だけ置く
export default async function TenantsPage() {
  // 表示に使うのはメールアドレスだけなので profiles は読まない（currentUser() は認可が要るときに使う）
  const user = await getAuthUser()
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={2}>店舗</Title>
        <Text c="dimmed">店舗一覧はマイルストーン 005 で実装します。</Text>
        <Text size="sm">ログイン中: {user?.email}</Text>
        <Group>
          <LinkButton href="/account" variant="default">
            アカウント
          </LinkButton>
        </Group>
      </Stack>
    </Container>
  )
}
