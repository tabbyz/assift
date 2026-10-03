import { Fragment } from 'react'
import { Badge, Divider, Group, Stack, Text } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import { strengthLabel } from '@/lib/restrictions/kinds'
import type { RestrictionRowView } from '@/lib/restrictions/rowView'

/** 強さの札。必須は塗り、なるべくは枠線（013 §4.1）。行の右端の同じ位置に置く */
export function StrengthBadge({ hard }: { hard: boolean }) {
  return (
    <Badge variant={hard ? 'filled' : 'outline'} color="dark" size="sm" radius="xl">
      {strengthLabel(hard)}
    </Badge>
  )
}

/**
 * 制約の行の並び（制約ページ・スタッフの編集画面で共有）。枠は呼び出し側の Paper が持つ。
 * 見出し（スタッフ名など）は `children` の前後に呼び出し側が置く
 */
export function RestrictionRows({ rows }: { rows: RestrictionRowView[] }) {
  return (
    <Stack gap={0}>
      {rows.map((row, index) => (
        <Fragment key={row.id}>
          {index > 0 && <Divider />}
          <Group justify="space-between" wrap="nowrap" gap="md" px="md" py="sm">
            <Stack gap={2} miw={0} style={{ flex: 1 }}>
              <Text size="sm" fw={500}>
                {row.description}
              </Text>
              <Text size="xs" c="dimmed">
                {row.kindLabel}
              </Text>
              {row.warning && (
                <Text size="xs" c="yellow.9">
                  {row.warning}
                </Text>
              )}
            </Stack>
            {/* 札と「編集」は縮めない（390px で説明文が長いと「必..」に切れる） */}
            <Group gap="md" wrap="nowrap" style={{ flexShrink: 0 }}>
              <StrengthBadge hard={row.hard} />
              <LinkAnchor href={row.href} size="sm">
                編集
              </LinkAnchor>
            </Group>
          </Group>
        </Fragment>
      ))}
    </Stack>
  )
}
