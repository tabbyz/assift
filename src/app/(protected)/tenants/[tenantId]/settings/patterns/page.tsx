import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Group, Stack, Title } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { ReorderHint } from '@/components/ReorderHint'
import { listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { PatternListClient } from './_components/PatternListClient'

export const metadata: Metadata = { title: '勤務パターン' }

export default async function PatternsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/patterns'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const patterns = await listPatterns(tenantId)

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>勤務パターン</Title>
        <LinkButton
          href={`/tenants/${tenantId}/settings/patterns/new`}
          size="sm"
          leftSection={<IconPlus size={16} />}
        >
          追加
        </LinkButton>
      </Group>

      <PatternListClient tenantId={tenantId} patterns={patterns} />

      <ReorderHint />
    </Stack>
  )
}
