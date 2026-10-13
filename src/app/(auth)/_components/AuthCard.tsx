import type { ReactNode } from 'react'
import { Paper } from '@mantine/core'

/** ログイン・登録・パスワード系のカード。ページが描く（カードの外、ページの一番下に置くものがあるため。/login の同意の表示） */
export function AuthCard({ children }: { children: ReactNode }) {
  return (
    <Paper withBorder shadow="sm" radius="md" p="xl">
      {children}
    </Paper>
  )
}
