import type { Metadata } from 'next'
import { Anchor, Box, Container, Divider, Paper, Stack, Text, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import { TERMS_ARTICLES } from './_components/articles'
import { TERMS } from './_components/terms'

export const metadata: Metadata = { title: '利用規約' }

/**
 * 利用規約（016）。ふだんの言葉で書き、冒頭の「あらまし」（各条のひとこと要約 = 目次）だけで要点が分かるようにする。
 * 本文は `_components/articles.tsx`、未確定の運営側の値は `_components/terms.ts`。
 */
export default function TermsPage() {
  return (
    <Container size={720} py="xl">
      <Stack gap="xl">
        <LinkAnchor href="/" c="inherit" underline="never" fw={700} size="lg" w="fit-content">
          assift
        </LinkAnchor>

        <Stack gap="xs">
          <Title order={1}>利用規約</Title>
          <Text size="sm" c="dimmed">
            制定 {TERMS.enactedOn} / 最終更新 {TERMS.updatedOn}
          </Text>
        </Stack>

        <Stack gap="sm">
          <Text>
            assift
            を使うときの、あなたと私たちの約束ごとです。利用規約はむずかしい言葉で書かれがちですが、内容をわかったうえで使ってほしいので、なるべくふだんの言葉で書きました。
          </Text>
          <Text>
            まずは下の「あらまし」だけでも読んでみてください。各条の要点を 1 つずつまとめています。
          </Text>
        </Stack>

        <Paper withBorder radius="md" p="lg" component="nav" aria-labelledby="terms-summary">
          <Stack gap="md">
            <Title order={2} size="h4" id="terms-summary">
              あらまし
            </Title>
            <Stack gap="sm" component="ol" m={0} p={0} style={{ listStyle: 'none' }}>
              {TERMS_ARTICLES.map((article, index) => (
                <Box component="li" key={article.id}>
                  <Anchor href={`#${article.id}`} fw={700}>
                    第{index + 1}条 {article.title}
                  </Anchor>
                  <Text size="sm" c="dimmed" mt={2}>
                    {article.summary}
                  </Text>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>

        {TERMS_ARTICLES.map((article, index) => (
          <Stack
            key={article.id}
            id={article.id}
            component="section"
            gap="sm"
            style={{ scrollMarginTop: 'var(--mantine-spacing-md)' }}
          >
            <Title order={2} size="h3">
              第{index + 1}条 {article.title}
            </Title>
            <Paper bg="var(--mantine-color-gray-0)" radius="sm" px="md" py="sm">
              <Text size="sm">
                <Text span fw={700} size="sm">
                  ひとことで：
                </Text>
                {article.summary}
              </Text>
            </Paper>
            {article.body}
          </Stack>
        ))}

        <Divider />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {TERMS.enactedOn} 制定
          </Text>
          <Text size="sm" c="dimmed">
            {TERMS.operator}
          </Text>
        </Stack>
      </Stack>
    </Container>
  )
}
