'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavLink, Stack, Text } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { assignLinks, settingsLinks, shiftsHref } from '@/lib/tenants/navigation'

/**
 * 設定ページのナビ。デスクトップは左カラム、モバイルは本文の上に積む（親の Flex が向きを変える）。
 * 見た目を 1 種類に保つため、モバイル専用の UI は作らない。
 */
export function SettingsNav({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()

  return (
    <Stack gap={4} miw={200}>
      <NavLink
        component={Link}
        href={shiftsHref(tenantId)}
        label="シフト表へ"
        leftSection={<IconArrowLeft size={18} />}
      />

      <Text size="xs" c="dimmed" px="sm" pt="sm">
        基本設定
      </Text>
      {settingsLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          prefetch={link.pending ? false : undefined}
          label={link.label}
          active={pathname === link.href}
        />
      ))}

      <Text size="xs" c="dimmed" px="sm" pt="sm">
        アサイン設定
      </Text>
      {assignLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          prefetch={link.pending ? false : undefined}
          label={link.label}
          active={pathname === link.href}
        />
      ))}
    </Stack>
  )
}
