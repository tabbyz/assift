'use client'

import { type ReactNode, useState } from 'react'
import Link from 'next/link'
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  Burger,
  Group,
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconArrowLeft, IconCreditCard, IconUserCircle } from '@tabler/icons-react'
import { LogoutMenuItem } from '@/components/LogoutMenuItem'

type Props = {
  /** 店舗がまだ無い初回は戻り先が無いので出さない */
  showBackToTenants?: boolean
  children: ReactNode
}

/**
 * 店舗の外側（/account、/account/billing）で使う簡易枠。v1 の navbar/_simple 相当。
 * 右上はハンバーガーメニュー 1 つにまとめる（店舗の画面と違うボタンが並ぶと、別のアプリに来たように見えて迷う）
 */
export function SimpleShell({ showBackToTenants = true, children }: Props) {
  const [opened, setOpened] = useState(false)
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
          <Menu position="bottom-end" withinPortal opened={opened} onChange={setOpened} width={200}>
            <MenuTarget>
              <Burger opened={opened} size="sm" aria-label="メニュー" />
            </MenuTarget>
            <MenuDropdown>
              {showBackToTenants && (
                <>
                  <MenuItem
                    component={Link}
                    href="/tenants"
                    leftSection={<IconArrowLeft size={16} />}
                  >
                    店舗に戻る
                  </MenuItem>
                  <MenuDivider />
                </>
              )}
              <MenuItem component={Link} href="/account" leftSection={<IconUserCircle size={16} />}>
                アカウント情報
              </MenuItem>
              <MenuItem
                component={Link}
                href="/account/billing"
                leftSection={<IconCreditCard size={16} />}
              >
                プランとお支払い
              </MenuItem>
              <MenuDivider />
              <LogoutMenuItem />
            </MenuDropdown>
          </Menu>
        </Group>
      </AppShellHeader>
      <AppShellMain>{children}</AppShellMain>
    </AppShell>
  )
}
