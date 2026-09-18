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
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconSettings, IconUserCircle } from '@tabler/icons-react'
import { LogoutMenuItem, LogoutNavLink } from '@/components/LogoutMenuItem'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import type { TenantSummary } from '@/lib/queries/tenants'
import { assignLinks, settingsLinks } from '@/lib/tenants/navigation'

type Props = {
  tenant: TenantSummary
  tenants: TenantSummary[]
  email: string
  children: ReactNode
}

const HEADER_HEIGHT = 56

/**
 * 店舗配下の共通枠（v1 の navbar/_normal 相当）。
 * シフト表が横幅を使うので常設のサイドバーは置かず、モバイルだけ Burger で Navbar を開く。
 */
export function TenantShell({ tenant, tenants, email, children }: Props) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const pathname = usePathname()

  // NavLink で遷移したあと Navbar が開いたままにならないように
  useEffect(close, [pathname, close])

  const settings = settingsLinks(tenant.id)
  const assign = assignLinks(tenant.id)

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 260, breakpoint: 'sm', collapsed: { desktop: true, mobile: !opened } }}
      padding="md"
    >
      <AppShellHeader>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="xs" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="メニュー"
            />
            <UnstyledButton component={Link} href="/tenants" visibleFrom="xs">
              <Text fw={700} c="teal">
                assift
              </Text>
            </UnstyledButton>
            <TenantSwitcher tenant={tenant} tenants={tenants} />
          </Group>

          <Group gap="xs" wrap="nowrap" visibleFrom="sm">
            <Menu position="bottom-end" withinPortal>
              <MenuTarget>
                <UnstyledButton aria-label="設定" p="xs">
                  <IconSettings size={20} />
                </UnstyledButton>
              </MenuTarget>
              <MenuDropdown>
                <MenuLabel>基本設定</MenuLabel>
                {settings.map((link) => (
                  <MenuItem key={link.href} component={Link} href={link.href}>
                    {link.label}
                  </MenuItem>
                ))}
                <MenuDivider />
                <MenuLabel>アサイン設定</MenuLabel>
                {assign.map((link) => (
                  <MenuItem key={link.href} component={Link} href={link.href}>
                    {link.label}
                  </MenuItem>
                ))}
              </MenuDropdown>
            </Menu>

            <Menu position="bottom-end" withinPortal>
              <MenuTarget>
                <UnstyledButton aria-label="アカウント" p="xs">
                  <IconUserCircle size={20} />
                </UnstyledButton>
              </MenuTarget>
              <MenuDropdown>
                <MenuLabel>{email}</MenuLabel>
                <MenuItem component={Link} href="/account">
                  アカウント情報
                </MenuItem>
                <MenuDivider />
                <LogoutMenuItem />
              </MenuDropdown>
            </Menu>
          </Group>
        </Group>
      </AppShellHeader>

      {/*
        閉じた Navbar は Mantine が unmount せず画面外へずらすだけなので、そのままだと
        見えないリンクにキーボードのフォーカスが入る（デスクトップは常に閉じているので常時）。
        inert で tab 順と支援技術の対象から外す。
      */}
      <AppShellNavbar p="sm" inert={!opened}>
        <ScrollArea>
          <Stack gap={4}>
            <Text size="xs" c="dimmed" px="sm" pt="xs">
              基本設定
            </Text>
            {settings.map((link) => (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                active={pathname === link.href}
              />
            ))}

            <Text size="xs" c="dimmed" px="sm" pt="sm">
              アサイン設定
            </Text>
            {assign.map((link) => (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                active={pathname === link.href}
              />
            ))}

            <Divider my="sm" />
            <Text size="xs" c="dimmed" px="sm">
              {email}
            </Text>
            <NavLink component={Link} href="/account" label="アカウント情報" />
            <LogoutNavLink />
          </Stack>
        </ScrollArea>
      </AppShellNavbar>

      <AppShellMain>{children}</AppShellMain>
    </AppShell>
  )
}
