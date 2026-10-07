import type { Metadata } from 'next'
import { Anchor, Container, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { TERMS_ARTICLES } from './_components/articles'
import { TERMS } from './_components/terms'

export const metadata: Metadata = { title: '利用規約' }

/**
 * 利用規約（016）。ふだんの言葉で書き、各条の本文のあとに要約を添える。
 * 本文は `_components/articles.tsx`、未確定の運営側の値は `_components/terms.ts`。
 */
export default function TermsPage() {
  return (
    <Container size={720} py="xl">
      <Stack gap="xl">
        <Title order={1}>利用規約</Title>

        <Text>assiftの利用条件を定めています。各条の終わりには、その条の要約を添えています。</Text>

        {TERMS_ARTICLES.map((article, index) => (
          <Stack
            key={article.id}
            id={article.id}
            component="section"
            gap="sm"
            style={{ scrollMarginTop: 'var(--site-anchor-offset)' }}
          >
            <Title order={2} size="h3">
              第{index + 1}条 {article.title}
            </Title>
            {article.body}
            <Paper bg="var(--mantine-color-gray-0)" radius="sm" px="md" py="sm">
              <Text size="sm">
                <Text span fw={700} size="sm">
                  要約：
                </Text>
                {article.summary}
              </Text>
            </Paper>
          </Stack>
        ))}

        <Divider />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {TERMS.enactedOn}制定
          </Text>
          {TERMS.updatedOn !== TERMS.enactedOn && (
            <Text size="sm" c="dimmed">
              {TERMS.updatedOn}改定
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
