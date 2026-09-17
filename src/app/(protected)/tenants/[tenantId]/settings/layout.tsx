import { Container, Flex } from '@mantine/core'
import { SettingsNav } from '@/components/SettingsNav'

/** 設定の共通枠。デスクトップはナビが左、モバイルは本文の上に積む */
export default async function SettingsLayout({
  children,
  params,
}: LayoutProps<'/tenants/[tenantId]/settings'>) {
  const { tenantId } = await params

  return (
    <Container size="lg" py="md">
      <Flex direction={{ base: 'column', sm: 'row' }} gap="lg" align="flex-start">
        <SettingsNav tenantId={tenantId} />
        <Flex direction="column" flex={1} w="100%" miw={0}>
          {children}
        </Flex>
      </Flex>
    </Container>
  )
}
