import { Container, Text, Title } from '@mantine/core'

// 仮ページ。004 で本実装に置き換える
export default function LoginPage() {
  return (
    <Container size="xs" py="xl">
      <Title order={2}>ログイン</Title>
      <Text c="dimmed" mt="sm">
        ログイン画面はマイルストーン 004 で実装します。
      </Text>
    </Container>
  )
}
