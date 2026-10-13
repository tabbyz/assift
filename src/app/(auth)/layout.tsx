import type { ReactNode } from 'react'
import { Container, Stack, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'

/**
 * ログイン・登録・パスワード系の共通枠。中央にカード 1 枚（カードは各ページの `AuthCard`）。
 * 画面の高さいっぱいに伸ばし、ページが `mt="auto"` で置いたものは一番下に出る。
 * 枠はカードより広く取る（カードの幅は `AuthCard` が決める）。/login の同意の表示を PC で 1 行に収めるため（541px）
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Container size="md" py="xl" mih="100dvh" display="flex" style={{ flexDirection: 'column' }}>
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
