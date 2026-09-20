import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Group, Stack, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { ReorderHint } from '@/components/ReorderHint'
import { listPatterns } from '@/lib/queries/patterns'
import { listRestrictions } from '@/lib/queries/restrictions'
import { isUuid } from '@/utils/uuid'
import { RestrictionListClient } from './_components/RestrictionListClient'

export const metadata: Metadata = { title: '自動アサイン制約' }

export default async function RestrictionsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/restrictions'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const [restrictions, patterns] = await Promise.all([
    listRestrictions(tenantId),
    listPatterns(tenantId),
  ])

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>アサイン制約</Title>
        <LinkButton
          href={`/tenants/${tenantId}/settings/restrictions/new`}
          size="sm"
          leftSection={<IconPlus size={16} />}
        >
          追加
        </LinkButton>
      </Group>

      <RestrictionListClient
        tenantId={tenantId}
        restrictions={restrictions}
        patternNames={patterns.map((pattern) => [pattern.id, pattern.name])}
      />

      <ReorderHint note="処理結果には影響しません" />
    </Stack>
  )
}
