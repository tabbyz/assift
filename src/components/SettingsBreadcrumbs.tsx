'use client'

import Link from 'next/link'
import { Anchor, Breadcrumbs, Text } from '@mantine/core'

type Props = {
  /** 一覧へのリンク（例: 「スタッフ一覧」） */
  parent: { href: string; label: string }
  /** 現在地（例: 「スタッフの編集」） */
  current: string
}

/**
 * 設定の下層ページのパンくず（v1 の breadcrumb）。
 * `Anchor component={Link}` は関数を渡すので Client（AGENTS.md の UI 規約）。
 */
export function SettingsBreadcrumbs({ parent, current }: Props) {
  return (
    <Breadcrumbs separator="›">
      <Anchor component={Link} href={parent.href} size="sm">
        {parent.label}
      </Anchor>
      <Text size="sm" c="dimmed">
        {current}
      </Text>
    </Breadcrumbs>
  )
}
