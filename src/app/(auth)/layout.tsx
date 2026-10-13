import type { ReactNode } from 'react'
import { Container, Stack, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'

/**
 * ログイン・登録・パスワード系の共通枠。中央にカード 1 枚（カードは各ページの `AuthCard`）。
 * 画面の高さいっぱいに伸ばし、ページが `mt="auto"` で置いたものは一番下に出る
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Container size={440} py="xl" mih="100dvh" display="flex" style={{ flexDirection: 'column' }}>
      <Stack gap="lg" flex={1}>
        <Title order={1} ta="center">
          <LinkAnchor href="/" c="inherit" underline="never">
            assift
          </LinkAnchor>
        </Title>
        {children}
      </Stack>
    </Container>
  )
}
