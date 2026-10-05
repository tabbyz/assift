import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { parseRequiredNums } from '@/lib/patterns/requiredNums'
import { listPatterns } from '@/lib/queries/patterns'
import { isUuid } from '@/utils/uuid'
import { RequiredNumsSettingsClient } from './_components/RequiredNumsSettingsClient'

export const metadata: Metadata = { title: '必要人数' }

export default async function RequiredNumsSettingsPage({
  params,
}: PageProps<'/tenants/[tenantId]/settings/required-nums'>) {
  const { tenantId } = await params
  // layout と page は並行に描画されるので、layout の notFound() は page のクエリを止めない（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  const patterns = await listPatterns(tenantId)

  return (
    <RequiredNumsSettingsClient
      tenantId={tenantId}
      patterns={patterns
        // 休みの勤務は必要人数を持たない（006 §3.9）
        .filter((pattern) => pattern.kind === 'workday')
        .map((pattern) => ({
          id: pattern.id,
          name: pattern.name,
          colorHex: pattern.color_hex,
          // jsonb はアプリ層の型に直してから Client に渡す（006 §3.9）
          defaultRequiredNums: parseRequiredNums(pattern.default_required_nums),
        }))}
    />
  )
}
