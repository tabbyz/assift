import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Alert, Stack, Title } from '@mantine/core'
import { SettingsBreadcrumbs } from '@/components/SettingsBreadcrumbs'
import { listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { PatternForm } from '../_components/PatternForm'

export const metadata: Metadata = { title: '勤務パターンの登録' }

export default async function NewPatternPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/patterns/new'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない。
  // uuid でない tenantId をそのまま投げると Postgres が 22P02 を出してログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()
  const patterns = await listPatterns(tenantId)

  return (
    <Stack gap="md">
      <SettingsBreadcrumbs
        parent={{ href: `/tenants/${tenantId}/settings/patterns`, label: '勤務パターン一覧' }}
        current="勤務パターンの登録"
      />
      <Title order={2}>勤務パターンの登録</Title>

      <Alert color="gray" variant="light">
        「日勤」や「夜勤」などの勤務日だけでなく、「休み」や「有給」などの休暇日もすべて勤務パターンとして登録できます。
      </Alert>

      <PatternForm
        tenantId={tenantId}
        pairOptions={patterns.map((pattern) => ({ value: pattern.id, label: pattern.name }))}
        afterCreate="list"
      />
    </Stack>
  )
}
