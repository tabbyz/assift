import type { Metadata } from 'next'
import { Container, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'

export const metadata: Metadata = { title: 'ページが見つかりません' }

/**
 * 404。`notFound()` を投げた layout / page がここに落ちる
 * （layout が投げた場合、その層の not-found では受けられないのでルートに置く）。
 *
 * 戻り先は `/`。未ログインの訪問者（共有 URL を削った人など）は LP が、ログイン済みは LP の redirect が店舗へ送る（016）。
 */
export default function NotFound() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md" align="center">
        <Title order={2}>ページが見つかりません</Title>
        <Text c="dimmed" ta="center">
          URL が間違っているか、削除された可能性があります。
        </Text>
        <LinkButton href="/">トップへ戻る</LinkButton>
      </Stack>
    </Container>
  )
}
