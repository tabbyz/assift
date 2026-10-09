'use client'

import { type ReactNode, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Button,
  Container,
  Group,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { ADMIN_USERS_PATH } from '@/lib/admin/paths'
import { adminLogout } from '../actions'

type Props = { email: string | null; children: ReactNode }

/** 管理画面の枠。本体の TenantShell は使わない（020 §8） */
export function AdminShell({ email, children }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const logout = () =>
    startTransition(async () => {
      const r = await adminLogout()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      router.push(r.data.redirectTo)
    })

  return (
    <AppShell header={{ height: 48 }} padding="md">
      <AppShellHeader>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="lg" wrap="nowrap">
            <UnstyledButton component={Link} href={ADMIN_USERS_PATH}>
              <Text fw={700} size="sm">
                assift 管理
              </Text>
            </UnstyledButton>
            <UnstyledButton component={Link} href={ADMIN_USERS_PATH}>
              <Text size="sm">ユーザー</Text>
            </UnstyledButton>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="xs" c="dimmed" visibleFrom="sm">
              {email}
            </Text>
            <Button variant="default" size="xs" onClick={logout} loading={isPending}>
              ログアウト
            </Button>
          </Group>
        </Group>
      </AppShellHeader>
      <AppShellMain>
        <Container size="lg" px={0}>
          {children}
        </Container>
      </AppShellMain>
    </AppShell>
  )
}
