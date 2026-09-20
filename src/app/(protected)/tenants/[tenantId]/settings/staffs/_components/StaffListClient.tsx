'use client'

import Link from 'next/link'
import { Anchor, Stack, Tabs, TabsList, TabsPanel, TabsTab, Text } from '@mantine/core'
import { useQueryStates } from 'nuqs'
import { ReorderHint } from '@/components/ReorderHint'
import { SortableList } from '@/components/SortableList'
import type { Staff } from '@/lib/queries/staffs'
import { reorderStaffs } from '../actions'
import { STAFF_TABS, type StaffTab, staffsParsers } from '../searchParams'
import styles from './StaffListClient.module.css'

type Props = {
  tenantId: string
  activeStaffs: Staff[]
  retiredStaffs: Staff[]
}

/** Mantine の onChange は `string | null` を渡してくる。parser のリテラル型へ絞ってから使う */
const isStaffTab = (value: string | null): value is StaffTab =>
  value !== null && (STAFF_TABS as readonly string[]).includes(value)

export function StaffListClient({ tenantId, activeStaffs, retiredStaffs }: Props) {
  // 両方のタブの中身は Server が渡し済みなので、切替は shallow（再フェッチしない）
  const [{ tab }, setQuery] = useQueryStates(staffsParsers)

  const editLink = (staff: Staff) => (
    <Anchor component={Link} href={`/tenants/${tenantId}/settings/staffs/${staff.id}`} size="sm">
      編集
    </Anchor>
  )

  const name = (staff: Staff) => <Text fw={500}>{staff.name}</Text>

  return (
    <Tabs value={tab} onChange={(value) => isStaffTab(value) && setQuery({ tab: value })}>
      <TabsList className={styles.list}>
        <TabsTab value="active">在籍中 ({activeStaffs.length}人)</TabsTab>
        <TabsTab value="retired">退職</TabsTab>
      </TabsList>

      <TabsPanel value="active" pt="md">
        <Stack gap="md">
          <SortableList
            items={activeStaffs}
            getId={(staff) => staff.id}
            emptyMessage="スタッフが登録されていません"
            onReorder={(ids) => reorderStaffs({ tenantId, ids })}
            renderItem={name}
            renderActions={editLink}
          />
          <ReorderHint />
        </Stack>
      </TabsPanel>

      <TabsPanel value="retired" pt="md">
        {/* 退職者は並べ替えない（在籍者だけを採番し直すので、onReorder を渡さない。006 §3.3） */}
        <SortableList
          items={retiredStaffs}
          getId={(staff) => staff.id}
          emptyMessage="スタッフがいません"
          renderItem={name}
          renderActions={editLink}
        />
      </TabsPanel>
    </Tabs>
  )
}
