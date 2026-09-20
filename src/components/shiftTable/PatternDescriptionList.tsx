import type { ReactNode } from 'react'
import { Group, Paper, Text } from '@mantine/core'
import { chipStyle } from './cellStyle'

type Props = {
  patterns: { id: string; name: string; description: string | null; colorHex: string }[]
  /** 公開ページの `© assift`。凡例が横に溢れても右端に残す */
  end?: ReactNode
}

/**
 * 表の下の凡例。公開ページでは色と名前を結ぶ手がかりになるので、説明の有無に関わらず出す。
 * チップは下書きセルと同じ淡塗りにして、表の中の色とそのまま結べるようにする。
 */
export function PatternDescriptionList({ patterns, end }: Props) {
  if (patterns.length === 0 && !end) return null

  const items = patterns.map((pattern) => (
    <Group key={pattern.id} gap={4} wrap="nowrap" style={{ flexShrink: 0 }}>
      <Paper withBorder px={6} py={2} radius="sm" style={chipStyle(pattern.colorHex)}>
        <Text size="xs" fw={600} style={{ whiteSpace: 'nowrap' }}>
          {pattern.name}
        </Text>
      </Paper>
      {pattern.description && (
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {pattern.description}
        </Text>
      )}
    </Group>
  ))

  if (!end) {
    return (
      <Group gap="md" wrap="nowrap" px={8} py={6} style={{ overflowX: 'auto' }}>
        {items}
      </Group>
    )
  }

  return (
    <Group gap="md" wrap="nowrap" align="center" px={8} py={6}>
      <Group gap="md" wrap="nowrap" style={{ flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}>
        {items}
      </Group>
      {end}
    </Group>
  )
}
