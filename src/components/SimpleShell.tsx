'use client'

import { useEffect, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  AppShell,
  AppShellHeader,
  AppShellMain,
  AppShellNavbar,
  Burger,
  Divider,
  Group,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconArrowLeft, IconCreditCard, IconUserCircle } from '@tabler/icons-react'
import { LogoutNavLink } from '@/components/LogoutMenuItem'
import classes from './TenantShell.module.css'

type Props = {
  /** 店舗がまだ無い初回は戻り先が無いので出さない */
  showBackToTenants?: boolean
  children: ReactNode
}

const navLinkClassNames = { root: classes.drawerItem, section: classes.drawerIcon }

/**
 * 店舗の外側（/account、/account/billing）で使う簡易枠。v1 の navbar/_simple 相当。
 * 店舗の画面（TenantShell）と同じく、左上のハンバーガーから Navbar を開く（右上にボタンが並ぶと別のアプリに見えて迷う）。
 * 店舗の外には他のナビが無いので、ハンバーガーは幅によらず出す
 */
export function SimpleShell({ showBackToTenants = true, children }: Props) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const pathname = usePathname()

  // 遷移したら閉じる（TenantShell と同じ）
  useEffect(close, [pathname, close])
  const closeIfActive = (href: string) => (pathname === href ? close : undefined)

  // 店舗配下の TenantShell と同じ高さ
  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{ width: 260, breakpoint: 'md', collapsed: { desktop: !opened, mobile: !opened } }}
      padding="md"
    >
      <AppShellHeader>
        <Group h="100%" px={8} gap={6} wrap="nowrap">
          <Burger opened={opened} onClick={toggle} size="sm" aria-label="メニュー" />
          <UnstyledButton component={Link} href="/">
            <Text fw={700} size="sm">
              assift
            </Text>
          </UnstyledButton>
        </Group>
      </AppShellHeader>

      <AppShellNavbar p="sm" inert={!opened}>
        <ScrollArea>
          <Stack gap={0}>
            {showBackToTenants && (
              <>
                <NavLink
                  component={Link}
                  href="/tenants"
                  label="店舗に戻る"
                  leftSection={<IconArrowLeft size={18} stroke={1.75} />}
                  classNames={navLinkClassNames}
                />
                <Divider my="sm" />
              </>
            )}
            <NavLink
              component={Link}
              href="/account"
              label="アカウント情報"
              leftSection={<IconUserCircle size={18} stroke={1.75} />}
              active={pathname === '/account'}
              onClick={closeIfActive('/account')}
              classNames={navLinkClassNames}
            />
            <NavLink
              component={Link}
              href="/account/billing"
              label="プランとお支払い"
              leftSection={<IconCreditCard size={18} stroke={1.75} />}
              active={pathname.startsWith('/account/billing')}
              onClick={closeIfActive('/account/billing')}
              classNames={navLinkClassNames}
            />
            <LogoutNavLink classNames={navLinkClassNames} />
          </Stack>
        </ScrollArea>
      </AppShellNavbar>

      <AppShellMain>{children}</AppShellMain>
    </AppShell>
  )
}
