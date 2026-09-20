'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Button,
  Group,
  Menu,
  MenuDropdown,
  MenuTarget,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconUserCircle } from '@tabler/icons-react'
import { LogoutMenuItem } from '@/components/LogoutMenuItem'
import classes from './SimpleShell.module.css'

type Props = {
  /** 店舗がまだ無い初回は戻り先が無いので出さない */
  showBackToTenants?: boolean
  children: ReactNode
}

/** 店舗の外側（/tenants/new、/account）で使う簡易枠。v1 の navbar/_simple 相当 */
export function SimpleShell({ showBackToTenants = true, children }: Props) {
  // 店舗配下の TenantShell と同じ高さ
  return (
    <AppShell header={{ height: 48 }} padding="md">
      <AppShellHeader>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <UnstyledButton component={Link} href="/">
            <Text fw={700} size="sm">
              assift
            </Text>
          </UnstyledButton>
          <Group gap="xs" wrap="nowrap">
            {showBackToTenants && (
              <Button component={Link} href="/tenants" variant="subtle" color="gray" size="compact-sm">
                店舗へ戻る
              </Button>
            )}
            <Menu position="bottom-end" withinPortal>
              <MenuTarget>
                <UnstyledButton aria-label="アカウント" className={classes.accountButton} p="xs">
                  <IconUserCircle size={20} />
                </UnstyledButton>
              </MenuTarget>
              <MenuDropdown>
                <LogoutMenuItem />
              </MenuDropdown>
            </Menu>
          </Group>
        </Group>
      </AppShellHeader>
      <AppShellMain>{children}</AppShellMain>
    </AppShell>
  )
}
