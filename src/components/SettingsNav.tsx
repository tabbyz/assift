'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Divider, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { configLinks, isLinkActive, masterLinks, shiftsHref } from '@/lib/tenants/navigation'
import classes from './SettingsNav.module.css'

/**
 * 設定ページのナビ。頻度順。店舗情報は末尾。
 * 「シフト表へ」は戻り。「設定」が見出しで項目を束ねる。
 * デスクトップは左カラム、モバイルは本文の上に積む（親の Flex が向きを変える）。
 */
export function SettingsNav({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()

  return (
    <Stack gap={4} miw={200}>
      <UnstyledButton component={Link} href={shiftsHref(tenantId)} className={classes.back}>
        <IconArrowLeft size={16} />
        シフト表へ
      </UnstyledButton>
      <Text size="xs" c="dimmed" px="sm">
        設定
      </Text>
      {masterLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          label={link.label}
          active={isLinkActive(link.href, pathname)}
        />
      ))}
      <Divider />
      {configLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          label={link.label}
          active={isLinkActive(link.href, pathname)}
        />
      ))}
    </Stack>
  )
}
