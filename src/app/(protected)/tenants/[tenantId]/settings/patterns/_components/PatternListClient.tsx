'use client'

import Link from 'next/link'
import { Anchor, Badge, ColorSwatch, Group, Stack, Text } from '@mantine/core'
import { SortableList } from '@/components/SortableList'
import { PATTERN_KIND_LABELS } from '@/lib/patterns/kinds'
import type { Pattern } from '@/lib/queries/patterns'
import { reorderPatterns } from '../actions'
import styles from './PatternListClient.module.css'

export function PatternListClient({
  tenantId,
  patterns,
}: {
  tenantId: string
  patterns: Pattern[]
}) {
  return (
    <SortableList
      items={patterns}
      getId={(pattern) => pattern.id}
      emptyMessage="勤務パターンが登録されていません"
      onReorder={(ids) => reorderPatterns({ tenantId, ids })}
      renderItem={(pattern) => (
        <Group gap="sm" wrap="nowrap">
          <Badge variant="light" color="gray" w={64}>
            {PATTERN_KIND_LABELS[pattern.kind]}
          </Badge>
          <ColorSwatch className={styles.swatch} color={pattern.color_hex} size={16} withShadow />
          <Stack gap={0} miw={0}>
            <Text fw={500} truncate>
              {pattern.name}
            </Text>
            {pattern.description && (
              <Text size="xs" c="dimmed" truncate>
                {pattern.description}
              </Text>
            )}
          </Stack>
        </Group>
      )}
      renderActions={(pattern) => (
        <Anchor
          component={Link}
          href={`/tenants/${tenantId}/settings/patterns/${pattern.id}`}
          size="sm"
        >
          編集
        </Anchor>
      )}
    />
  )
}
