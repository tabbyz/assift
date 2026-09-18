'use client'

import Link from 'next/link'
import { Anchor, Stack, Text } from '@mantine/core'
import { SortableList } from '@/components/SortableList'
import type { Restriction } from '@/lib/queries/restrictions'
import { describeRestriction } from '@/lib/restrictions/describe'
import { RESTRICTION_KIND_LABELS } from '@/lib/restrictions/kinds'
import { reorderRestrictions } from '../actions'

type Props = {
  tenantId: string
  restrictions: Restriction[]
  /** パターン id → 名前。説明文の生成に使う（埋め込みではなく TS 側で引く。006 §5.3） */
  patternNames: [string, string][]
}

export function RestrictionListClient({ tenantId, restrictions, patternNames }: Props) {
  const names = new Map(patternNames)

  return (
    <SortableList
      items={restrictions}
      getId={(restriction) => restriction.id}
      emptyMessage="登録されているアサイン制約はありません"
      onReorder={(ids) => reorderRestrictions({ tenantId, ids })}
      renderItem={(restriction) => (
        <Stack gap={0}>
          <Text fw={700}>{describeRestriction(restriction, names)}</Text>
          <Text size="xs" c="dimmed">
            {RESTRICTION_KIND_LABELS[restriction.kind]}
          </Text>
        </Stack>
      )}
      renderActions={(restriction) => (
        <Anchor
          component={Link}
          href={`/tenants/${tenantId}/settings/restrictions/${restriction.id}`}
          size="sm"
        >
          編集
        </Anchor>
      )}
    />
  )
}
