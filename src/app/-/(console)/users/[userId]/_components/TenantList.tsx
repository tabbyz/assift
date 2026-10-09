'use client'

import { Accordion, Badge, Group, SimpleGrid, Stack, Text } from '@mantine/core'

export type TenantListItem = {
  id: string
  name: string
  createdAt: string
  setupCompleted: boolean
  activeStaffs: string[]
  retiredStaffs: string[]
  patternCount: number
  assistRunCount: number
  lastAssistRunAt: string
}

/** 店舗ごとの数字。スタッフの一覧は開閉する（020 §8） */
export function TenantList({ tenants }: { tenants: TenantListItem[] }) {
  return (
    <Accordion multiple chevronPosition="left">
      {tenants.map((t) => (
        <Accordion.Item key={t.id} value={t.id}>
          <Accordion.Control>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" fw={600}>
                {t.name}
              </Text>
              {!t.setupCompleted && (
                <Badge variant="light" color="yellow" size="sm">
                  準備中
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                在籍 {t.activeStaffs.length} 人
              </Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
                <Item label="作成日" value={t.createdAt} />
                <Item label="勤務パターン" value={`${t.patternCount}`} />
                <Item label="自動アサイン" value={`${t.assistRunCount} 回`} />
                <Item label="最後の自動アサイン" value={t.lastAssistRunAt} />
              </SimpleGrid>
              <Item
                label={`在籍（${t.activeStaffs.length}）`}
                value={t.activeStaffs.join('、') || '—'}
              />
              <Item
                label={`退職（${t.retiredStaffs.length}）`}
                value={t.retiredStaffs.join('、') || '—'}
              />
              <Text size="xs" c="dimmed">
                店舗 ID: {t.id}
              </Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  )
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm">{value}</Text>
    </Stack>
  )
}
