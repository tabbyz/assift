import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Container, Stack, Text, Title } from '@mantine/core'
import { getTenant } from '@/lib/queries/tenants'

export const metadata: Metadata = { title: 'シフト表' }

// 仮ページ。007 で本実装（期間計算・カレンダー・アサイン）に置き換える
export default async function ShiftsPage({ params }: PageProps<'/tenants/[tenantId]/shifts'>) {
  const { tenantId } = await params
  const tenant = await getTenant(tenantId)
  if (!tenant) notFound()

  return (
    <Container size="sm" py="xl">
      <Stack gap="md">
        <Title order={2}>シフト表</Title>
        <Text c="dimmed">{tenant.name} のシフト表はマイルストーン 007 で実装します。</Text>
      </Stack>
    </Container>
  )
}
