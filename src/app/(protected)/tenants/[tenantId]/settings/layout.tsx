import { notFound, redirect } from 'next/navigation'
import { Container, Flex } from '@mantine/core'
import { SettingsNav } from '@/components/SettingsNav'
import { getTenant } from '@/lib/queries/tenants'
import { isUuid } from '@/utils/uuid'

/** 設定の共通枠。デスクトップはナビが左。モバイルはナビを出さない（バーガーに同じ項目がある） */
export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<'/tenants/[tenantId]/settings'>) {
  const { tenantId } = await params
  if (!isUuid(tenantId)) notFound()
  // 準備中の店舗は初期設定の続きへ（014 §3.7）。`getTenant` は cache() 済みなので親 layout と合わせて 1 回しか読まない
  const tenant = await getTenant(tenantId)
  if (!tenant) notFound()
  if (!tenant.setup_completed_at) redirect(`/tenants/${tenantId}/setup`)

  return (
    <Container size="lg" py="md">
      <Flex gap="lg" align="flex-start">
        <SettingsNav tenantId={tenantId} />
        <Flex direction="column" flex={1} w="100%" miw={0}>
          {children}
        </Flex>
      </Flex>
    </Container>
  )
}
