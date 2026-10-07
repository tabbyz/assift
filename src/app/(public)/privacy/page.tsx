import type { Metadata } from 'next'
import { Anchor, Container, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import { TERMS } from '../terms/_components/terms'
import { PRIVACY } from './_components/privacy'
import { PRIVACY_SECTIONS } from './_components/sections'

export const metadata: Metadata = { title: 'プライバシーポリシー' }

/**
 * プライバシーポリシー（017）。利用規約（016）と同じ形で、各項の本文のあとに要約を添える。
 * 本文は `_components/sections.tsx`、未確定の運営側の値は `_components/privacy.ts`。
 */
export default function PrivacyPage() {
  return (
    <Container size={720} py="xl">
      <Stack gap="xl">
        <LinkAnchor href="/" c="inherit" underline="never" fw={700} size="lg" w="fit-content">
          assift
        </LinkAnchor>

        <Title order={1} fz={{ base: 28, xs: 34 }}>
          プライバシーポリシー
        </Title>

        <Text>
          assiftにおける個人情報の取り扱いについて定めています。各項の終わりに要約を添えていますが、要約と本文の内容が異なって読める場合は、本文を優先します。
        </Text>

        {PRIVACY_SECTIONS.map((section, index) => (
          <Stack
            key={section.id}
            id={section.id}
            component="section"
            gap="sm"
            style={{ scrollMarginTop: 'var(--mantine-spacing-md)' }}
          >
            <Title order={2} size="h3">
              {index + 1}. {section.title}
            </Title>
            {section.body}
            <Paper bg="var(--mantine-color-gray-0)" radius="sm" px="md" py="sm">
              <Text size="sm">
                <Text span fw={700} size="sm">
                  要約：
                </Text>
                {section.summary}
              </Text>
            </Paper>
          </Stack>
        ))}

        <Divider />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {PRIVACY.enactedOn}制定
          </Text>
          {PRIVACY.updatedOn !== PRIVACY.enactedOn && (
            <Text size="sm" c="dimmed">
              {PRIVACY.updatedOn}改定
            </Text>
          )}
          <Text size="sm" c="dimmed">
            {TERMS.operator}（
            <Anchor href={`mailto:${TERMS.contactEmail}`} size="sm" c="dimmed">
              {TERMS.contactEmail}
            </Anchor>
            ）
          </Text>
        </Stack>
      </Stack>
    </Container>
  )
}
