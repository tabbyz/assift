import { Group, Paper, Text } from '@mantine/core'
import { outlineColor } from '@/lib/patterns/colors'

type Props = {
  patterns: { id: string; name: string; description: string | null; colorHex: string }[]
}

/**
 * 表の下に出すパターンの凡例（v1 `_pattern_description_list.html.slim`）。
 * 説明が入っているパターンだけを横に並べる。
 *
 * 名前の枠はパターン色で描く（v1 と同じ）。公開ページにはポップオーバーが無く、
 * 凡例が色と名前を結ぶ唯一の手がかりになる（009 §3.6）。白いパターンは枠ごと消えるので
 * `outlineColor()` が既定の枠線色に落とす。
 */
export function PatternDescriptionList({ patterns }: Props) {
  const described = patterns.filter((pattern) => pattern.description)
  if (described.length === 0) return null

  return (
    <Group gap="md" wrap="nowrap" py="xs" style={{ overflowX: 'auto' }}>
      {described.map((pattern) => (
        <Group key={pattern.id} gap={4} wrap="nowrap">
          <Paper
            withBorder
            px={4}
            py={2}
            radius="sm"
            style={{ borderColor: outlineColor(pattern.colorHex) }}
          >
            <Text size="xs">{pattern.name}</Text>
          </Paper>
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {pattern.description}
          </Text>
        </Group>
      ))}
    </Group>
  )
}
