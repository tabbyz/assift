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
import { IconUserCircle } from '@tabler/icons-react'
import { LogoutMenuItem, LogoutNavLink } from '@/components/LogoutMenuItem'
import { TenantSwitcher } from '@/components/TenantSwitcher'
import type { TenantSummary } from '@/lib/queries/tenants'
import {
  configLinks,
  isLinkActive,
  isSettingsPath,
  isShiftsPath,
  masterLinks,
  primaryLinks,
  settingsHref,
} from '@/lib/tenants/navigation'
import classes from './TenantShell.module.css'

type Props = {
  tenant: TenantSummary
  tenants: TenantSummary[]
  email: string
  children: ReactNode
}

const HEADER_HEIGHT = 48

/**
 * 店舗配下の共通枠。表が横幅を使うので常設サイドバーは置かない。
 * padding は 0。シフト表がキャンバスの端まで行き、設定は Container が inset を持つ。
 * ヘッダー右の「設定」からマスタへ入る。表へ戻るのは設定ナビの「シフト表へ」。
 */
export function TenantShell({ tenant, tenants, email, children }: Props) {
  const [opened, { toggle, close }] = useDisclosure(false)
  const pathname = usePathname()

  useEffect(close, [pathname, close])

  const primary = primaryLinks(tenant.id)
  const settingsActive = isSettingsPath(pathname)

  return (
    <AppShell
      header={{ height: HEADER_HEIGHT }}
      navbar={{ width: 260, breakpoint: 'md', collapsed: { desktop: true, mobile: !opened } }}
      padding={0}
    >
      <AppShellHeader>
        <Group h="100%" px={8} justify="space-between" wrap="nowrap" gap="sm">
          <Group gap={6} wrap="nowrap" miw={0}>
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="md"
              size="sm"
              aria-label="メニュー"
            />
            <UnstyledButton component={Link} href="/tenants" visibleFrom="sm">
              <Text fw={700} size="sm">
                assift
              </Text>
            </UnstyledButton>
            <TenantSwitcher tenant={tenant} tenants={tenants} />
          </Group>

          <Group gap={4} wrap="nowrap" visibleFrom="md">
            <UnstyledButton
              component={Link}
              href={settingsHref(tenant.id)}
              className={classes.navLink}
              data-active={settingsActive || undefined}
            >
              設定
            </UnstyledButton>

            <Menu position="bottom-end" withinPortal>
              <MenuTarget>
                <UnstyledButton aria-label="アカウント" className={classes.accountButton} p="xs">
                  <IconUserCircle size={18} />
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

      <AppShellNavbar p="sm" inert={!opened}>
        <ScrollArea>
          <Stack gap={4}>
            {primary.map((link) => (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                active={isShiftsPath(pathname)}
              />
            ))}

            <Text size="xs" c="dimmed" px="sm" pt="sm">
              設定
            </Text>
            {masterLinks(tenant.id).map((link) => (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                active={isLinkActive(link.href, pathname)}
              />
            ))}
            <Divider />
            {configLinks(tenant.id).map((link) => (
              <NavLink
                key={link.href}
                component={Link}
                href={link.href}
                label={link.label}
                active={isLinkActive(link.href, pathname)}
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
