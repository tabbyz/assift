import type { Metadata } from 'next'
import { Container, Stack, Text, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'

export const metadata: Metadata = {
  title: 'ページが見つかりません',
  robots: { index: false, follow: false },
}

/**
 * 公開シフト表の 404（v1 `shares/disabled.html.slim`）。
 *
 * **必ずこのセグメントに置く**: ルートの `not-found.tsx` は「店舗へ戻る」（`/tenants`）へ誘導するので、
 * 未ログインの訪問者に出してはいけない。存在しない / 期限切れ / 解除済みはすべてここに落ちる。
 */
export default function ShareNotFound() {
  return (
    <Container size="sm" py="xl">
      <Stack gap="md" align="center">
        <Title order={1} size="h4">
          ページが見つかりませんでした。
        </Title>
        <Text c="dimmed" ta="center">
          このシフト表は、公開期限が過ぎているかすでに削除されています。
        </Text>
        <LinkAnchor href="/">assift.com</LinkAnchor>
      </Stack>
    </Container>
  )
}
