'use client'

import { useState, type MouseEvent } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NavLink, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { isLinkActive, settingsLinks, shiftsHref } from '@/lib/tenants/navigation'
import classes from './SettingsNav.module.css'

/**
 * 設定ページのナビ。頻度順。店舗情報は末尾。
 * 1 項目 32px（GitHub Primer の NavList・GitLab のサイドバーと同じ密度）。
 * `sm` 以上はマウス操作が主なので、モバイルの 44px（タップ領域）より詰める。
 * 「シフト表画面へ」は戻り。「設定」が見出しで項目を束ねる。
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
    <Stack gap={2} miw={200} visibleFrom="sm">
      <UnstyledButton component={Link} href={shiftsHref(tenantId)} className={classes.back}>
        <IconArrowLeft size={16} />
        シフト表画面へ
      </UnstyledButton>
      <Text size="xs" c="dimmed" px={8} pt={4} pb={2}>
        設定
      </Text>
      {settingsLinks(tenantId).map((link) => (
        <NavLink
          key={link.href}
          component={Link}
          href={link.href}
          label={link.label}
          leftSection={<link.icon size={16} stroke={1.75} />}
          active={isLinkActive(link.href, currentPath)}
          onClick={onNavigate(link.href)}
          classNames={{ root: classes.item, section: classes.icon }}
        />
      ))}
    </Stack>
  )
}
