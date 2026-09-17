import type { ReactNode } from 'react'
import { Container, Paper, Stack, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'

/** ログイン・登録・パスワード系の共通枠。中央にカード 1 枚 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Container size={440} py="xl">
      <Stack gap="lg">
        <Title order={1} ta="center">
          <LinkAnchor href="/" c="inherit" underline="never">
            assift
          </LinkAnchor>
        </Title>
        <Paper withBorder shadow="sm" radius="md" p="xl">
          {children}
        </Paper>
      </Stack>
    </Container>
  )
}
