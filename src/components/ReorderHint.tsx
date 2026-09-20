import { Group, Text } from '@mantine/core'
import { IconArrowDown, IconArrowUp } from '@tabler/icons-react'

type Props = { note?: string }

/** 行の上下ボタンと同じ矢印を出して、どのアイコンで並べ替えるかを示す */
export function ReorderHint({ note }: Props) {
  return (
    <Group gap={6} justify="flex-end" wrap="nowrap" c="dimmed">
      <Group gap={2} wrap="nowrap">
        <IconArrowUp size={14} />
        <IconArrowDown size={14} />
      </Group>
      <Text size="xs">で並べ替え{note ? `（${note}）` : ''}</Text>
    </Group>
  )
}
