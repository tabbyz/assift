import type { Metadata } from 'next'
import { Container, Stack } from '@mantine/core'
import { TutorialSteps } from './_components/TutorialSteps'

export const metadata: Metadata = { title: '初期設定' }

export default async function TutorialLayout({
  children,
  params,
}: LayoutProps<'/tenants/[tenantId]/tutorial'>) {
  const { tenantId } = await params

  return (
    <Container size={640} py="md">
      <Stack gap="xl">
        <TutorialSteps tenantId={tenantId} />
        {children}
      </Stack>
    </Container>
  )
}
