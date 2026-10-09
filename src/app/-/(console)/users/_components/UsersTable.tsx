'use client'

import Link from 'next/link'
import { Anchor, Badge, Group, Pagination, ScrollArea, Stack, Table, Text } from '@mantine/core'
import { useQueryStates } from 'nuqs'
import { adminUserPath } from '@/lib/admin/paths'
import { adminUsersParsers } from '../searchParams'

export type UserListItem = {
  id: string
  email: string
  createdAt: string
  lastSignInAt: string
  providers: string
  plan: string
  locked: boolean
  trialLastDay: string
  tenantCount: number
  activeStaffCount: number
}

type Props = { items: UserListItem[]; total: number | null; page: number; pageSize: number }

export function UsersTable({ items, total, page, pageSize }: Props) {
  const [, setParams] = useQueryStates(adminUsersParsers, { shallow: false })

  // 範囲外のページは 0 行で総数が分からない（020 §6.1）
  if (items.length === 0) {
    return (
      <Stack gap="xs">
        <Text c="dimmed">該当するユーザーはいません</Text>
        {page > 1 && (
          <Anchor
            component="button"
            type="button"
            size="sm"
            ta="left"
            onClick={() => setParams({ page: null })}
          >
            1 ページ目へ
          </Anchor>
        )}
      </Stack>
    )
  }

  const pages = total === null ? page : Math.max(1, Math.ceil(total / pageSize))

  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        {total} 人
      </Text>
      <ScrollArea>
        <Table striped highlightOnHover miw={960}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>メールアドレス</Table.Th>
              <Table.Th>登録日</Table.Th>
              <Table.Th>最終ログイン</Table.Th>
              <Table.Th>登録方法</Table.Th>
              <Table.Th>契約</Table.Th>
              <Table.Th>トライアルの最終日</Table.Th>
              <Table.Th ta="right">店舗</Table.Th>
              <Table.Th ta="right">在籍</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>
                  <Anchor component={Link} href={adminUserPath(item.id)} size="sm">
                    {item.email}
                  </Anchor>
                </Table.Td>
                <Table.Td>{item.createdAt}</Table.Td>
                <Table.Td>{item.lastSignInAt}</Table.Td>
                <Table.Td>{item.providers}</Table.Td>
                <Table.Td>
                  <Group gap={6} wrap="nowrap">
                    <Text size="sm">{item.plan}</Text>
                    {item.locked && (
                      <Badge color="red" variant="light" size="sm">
                        ロック中
                      </Badge>
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{item.trialLastDay}</Table.Td>
                <Table.Td ta="right">{item.tenantCount}</Table.Td>
                <Table.Td ta="right">{item.activeStaffCount}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>
      {pages > 1 && (
        <Pagination
          total={pages}
          value={page}
          onChange={(next) => setParams({ page: next === 1 ? null : next })}
          size="sm"
        />
      )}
    </Stack>
  )
}
