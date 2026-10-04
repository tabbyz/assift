import type { ReactNode } from 'react'
import { Box, Group, Paper, Stack, Text, Title } from '@mantine/core'

type Props = {
  /** 省略すると枠だけ（ページの見出しがそのままセクションの見出しになるフォーム） */
  title?: ReactNode
  description?: ReactNode
  /** 見出しの右端（「規則を追加」など） */
  action?: ReactNode
  /** 中身が一覧の行など、枠いっぱいに描くときは false */
  padded?: boolean
  /** 枠の下端に区切り線を挟んで右寄せで置く（保存・キャンセル）。submit させるときは `<form>` で SettingsSection ごと包む */
  footer?: ReactNode
  children: ReactNode
}

/** 設定画面のセクション。見出しは枠の外、入力や一覧と保存ボタンは枠の中に置く */
export function SettingsSection({
  title,
  description,
  action,
  padded = true,
  footer,
  children,
}: Props) {
  return (
    <Stack component="section" gap="xs">
      {(title || description || action) && (
        <Group justify="space-between" align="flex-end" wrap="nowrap">
          <Stack gap={2}>
            {title && <Title order={4}>{title}</Title>}
            {description && (
              <Text size="sm" c="dimmed">
                {description}
              </Text>
            )}
          </Stack>
          {/* 説明文が長いと、押し出されてボタンの文字が欠ける */}
          {action && <Box style={{ flexShrink: 0 }}>{action}</Box>}
        </Group>
      )}
      <Paper withBorder>
        {padded ? <Box p="lg">{children}</Box> : children}
        {footer && (
          <Group
            justify="flex-end"
            gap="xs"
            px="lg"
            py="md"
            style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
          >
            {footer}
          </Group>
        )}
      </Paper>
    </Stack>
  )
}
