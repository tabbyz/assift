import { Container, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'

// 仮の LP。011 で本実装に置き換える
export default function HomePage() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={1}>assift</Title>
        <Text c="dimmed">シフト表の作成を驚くほどカンタンに。</Text>
        <LinkButton href="/login" w="fit-content">
          ログイン
        </LinkButton>
      </Stack>
    </Container>
  )
}
