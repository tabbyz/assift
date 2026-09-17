import { Container, Text, Title } from '@mantine/core'

// 仮ページ。005 で本実装に置き換える
export default function TenantsPage() {
  return (
    <Container size="sm" py="xl">
      <Title order={2}>店舗</Title>
      <Text c="dimmed" mt="sm">
        店舗一覧はマイルストーン 005 で実装します。
      </Text>
    </Container>
  )
}
