'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Divider, NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { configLinks, isLinkActive, masterLinks, shiftsHref } from '@/lib/tenants/navigation'
import classes from './SettingsNav.module.css'

/**
 * 設定ページのナビ。頻度順。店舗情報は末尾。
 * 「シフト表へ」は戻り。「設定」が見出しで項目を束ねる。
 * `sm` 以上だけ出す（左カラム）。モバイルはヘッダーのバーガーに同じ項目があるので、
 * 本文の上に積むと重複したうえ画面の半分以上を占める。
 *
 * 現在地はクリックした瞬間に移す。usePathname() は遷移が確定するまで変わらず、
 * 本文の読み込み中（prefetch が間に合わないとき）に押したのに無反応に見えるため。
 * 押したときの pathname を覚えておき、pathname が変われば（遷移の確定・取り消し）自然に無効になる。
 */
export function SettingsNav({ tenantId }: { tenantId: string }) {
  const pathname = usePathname()
  const [pending, setPending] = useState<{ href: string; from: string } | null>(null)
  const currentPath = pending?.from === pathname ? pending.href : pathname

  // 新しいタブで開く操作は現在地を動かさない
  const onNavigate = (href: string) => (event: MouseEvent) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    setPending({ href, from: pathname })
  }

  return (
    <Stack gap={4} miw={200} visibleFrom="sm">
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
          active={isLinkActive(link.href, currentPath)}
          onClick={onNavigate(link.href)}
        />
      ))}
      <Divider />
      {configLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          label={link.label}
          active={isLinkActive(link.href, currentPath)}
          onClick={onNavigate(link.href)}
        />
      ))}
    </Stack>
  )
}
