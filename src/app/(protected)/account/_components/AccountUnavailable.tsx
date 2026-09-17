'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Container, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconAlertCircle } from '@tabler/icons-react'
import { logout } from '../actions'

/**
 * ログイン情報を読み出せないとき（他の端末でのアカウント削除・セッション失効など）の表示。
 * cookie の JWT はまだ期限内なので proxy は通してしまう。ここからログアウトだけできるようにする。
 */
export function AccountUnavailable() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const doLogout = () =>
    startTransition(async () => {
      const r = await logout()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      router.push(r.data.redirectTo)
    })

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>アカウント</Title>
        <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
          アカウント情報を読み込めませんでした。ログインの有効期限が切れているか、アカウントが削除された可能性があります。
        </Alert>
        <Paper withBorder p="lg">
          <Group justify="space-between">
            <Text size="sm">ログアウトして、もう一度ログインしてください。</Text>
            <Button onClick={doLogout} loading={isPending}>
              ログアウト
            </Button>
          </Group>
        </Paper>
      </Stack>
    </Container>
  )
}
