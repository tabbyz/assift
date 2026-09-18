import { Group, Paper, Text } from '@mantine/core'

type Props = { patterns: { id: string; name: string; description: string | null }[] }

/**
 * 表の下に出すパターンの凡例（v1 `_pattern_description_list.html.slim`）。
 * 説明が入っているパターンだけを横に並べる。
 */
export function PatternDescriptionList({ patterns }: Props) {
  const described = patterns.filter((pattern) => pattern.description)
  if (described.length === 0) return null

  return (
    <Group gap="md" wrap="nowrap" py="xs" style={{ overflowX: 'auto' }}>
      {described.map((pattern) => (
        <Group key={pattern.id} gap={4} wrap="nowrap">
          <Paper withBorder px={4} py={2} radius="sm">
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
