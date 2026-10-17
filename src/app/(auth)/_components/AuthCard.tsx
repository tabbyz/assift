import type { ReactNode } from 'react'
import { Paper } from '@mantine/core'

/** カードの最大幅。以前の枠（`Container size={440}`）から左右の余白 16px ずつを引いた幅 */
const AUTH_CARD_MAX_WIDTH = 408

/**
 * ログイン・登録・パスワード系のカード。ページが描く（カードの外、ページの一番下に置くものがあるため。/login の同意の表示）。
 * `mb="auto"` は layout のロゴの `mt="auto"` と対で、ロゴ + カードを縦の中央に置く
 */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <Paper
      withBorder
      shadow="sm"
      radius="md"
      p="xl"
      w="100%"
      maw={AUTH_CARD_MAX_WIDTH}
      mx="auto"
      mb="auto"
    >
      {children}
    </Paper>
  )
}
