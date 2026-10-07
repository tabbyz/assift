import type { Metadata } from 'next'
import {
  Container,
  Divider,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableTr,
  Text,
  Title,
} from '@mantine/core'
import { FooterLinks } from '@/components/FooterLinks'
import { LinkAnchor } from '@/components/LinkAnchor'
import { LAW } from './_components/law'
import { LAW_ITEMS } from './_components/items'

export const metadata: Metadata = { title: '特定商取引法に基づく表記' }

/**
 * 特定商取引法に基づく表記（018）。利用規約・プライバシーポリシーと同じ枠で、項目は表にする。
 * 項目は `_components/items.tsx`、未確定の運営側の値は `_components/law.ts`。
 */
export default function LawPage() {
  return (
    <Container size={720} py="xl">
      <Stack gap="xl">
        <LinkAnchor href="/" c="inherit" underline="never" fw={700} size="lg" w="fit-content">
          assift
        </LinkAnchor>

        <Title order={1} fz={{ base: 22, xs: 34 }}>
          特定商取引法に基づく表記
        </Title>

        <Table layout="fixed" verticalSpacing="md" horizontalSpacing="sm">
          <TableTbody>
            {LAW_ITEMS.map((item) => (
              <TableTr key={item.label}>
                <TableTh w={{ base: 104, xs: 200 }} style={{ verticalAlign: 'top' }}>
                  {item.label}
                </TableTh>
                <TableTd>
                  <Stack gap="xs">{item.body}</Stack>
                </TableTd>
              </TableTr>
            ))}
          </TableTbody>
        </Table>

        <Divider />
        <Stack gap={4}>
          <Text size="sm" c="dimmed">
            {LAW.enactedOn}制定
          </Text>
          {LAW.updatedOn !== LAW.enactedOn && (
            <Text size="sm" c="dimmed">
              {LAW.updatedOn}改定
            </Text>
          )}
        </Stack>
        <footer>
          <FooterLinks />
        </footer>
      </Stack>
    </Container>
  )
}
