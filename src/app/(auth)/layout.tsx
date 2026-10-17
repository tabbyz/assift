import type { ReactNode } from 'react'
import { Container, Stack, Title } from '@mantine/core'
import { AssiftLogo } from '@/components/brand/AssiftLogo'
import { LinkAnchor } from '@/components/LinkAnchor'

/**
 * ログイン・登録・パスワード系の共通枠。中央にカード 1 枚（カードは各ページの `AuthCard`）。
 * 画面の高さいっぱいに伸ばし、ページが `mt="auto"` で置いたものは一番下に出る。
 * ロゴ（`mt="auto"`）とカード（`AuthCard` の `mb="auto"`）で余った高さを分け、ロゴ + カードを縦の中央に置く。
 * 下に置くものがあるページ（/login の同意の表示）は余りが上 1 : 下 2 になり、少し上寄りに見える（目で見た中央）
 * 枠はカードより広く取る（カードの幅は `AuthCard` が決める）。/login の同意の表示を PC で 1 行に収めるため（541px）
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Container size="md" py="xl" mih="100dvh" display="flex" style={{ flexDirection: 'column' }}>
      <Stack gap="lg" flex={1}>
        <Title order={1} ta="center" mt="auto">
          <LinkAnchor href="/" c="inherit" underline="never" display="inline-block">
            <AssiftLogo height={36} />
          </LinkAnchor>
        </Title>
        {children}
      </Stack>
    </Container>
  )
}
