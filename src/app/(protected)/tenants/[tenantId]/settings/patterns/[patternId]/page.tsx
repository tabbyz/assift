import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { parseRequiredNums } from '@/lib/patterns/requiredNums'
import { getPattern, listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { PatternEditClient } from '../_components/PatternEditClient'
import { PatternForm } from '../_components/PatternForm'

export const metadata: Metadata = { title: '勤務パターンの編集' }

export default async function EditPatternPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/patterns/[patternId]'>) {
  const { tenantId, patternId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  if (!isUuid(patternId)) notFound()

  const [pattern, patterns] = await Promise.all([
    getPattern(tenantId, patternId),
    listPatterns(tenantId),
  ])
  // RLS と tenant_id の重ねがけで、他店舗も存在しない id も同じ null になる
  if (!pattern) notFound()

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/patterns`, label: '勤務パターン一覧' }}
        current="勤務パターンの編集"
      />
      <Title order={2}>勤務パターンの編集</Title>

      <PatternForm
        tenantId={tenantId}
        // 自分自身はペアに選べない（無限に連鎖する。006 §3.8）
        pairOptions={patterns
          .filter((candidate) => candidate.id !== pattern.id)
          .map((candidate) => ({ value: candidate.id, label: candidate.name }))}
        initial={{
          patternId: pattern.id,
          name: pattern.name,
          description: pattern.description ?? '',
          colorHex: pattern.color_hex,
          kind: pattern.kind,
          pairPatternId: pattern.pair_pattern_id,
          defaultRequiredNums: parseRequiredNums(pattern.default_required_nums),
        }}
        afterCreate="list"
      />

      <PatternEditClient tenantId={tenantId} patternId={pattern.id} />
    </Stack>
  )
}
