'use client'

import Link from 'next/link'
import { Button, Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget, Text } from '@mantine/core'
import { IconCheck, IconChevronDown, IconPlus } from '@tabler/icons-react'
import type { TenantSummary } from '@/lib/queries/tenants'

type Props = { tenant: TenantSummary; tenants: TenantSummary[] }

/** v1 navbar と同じく 12 文字で省略する */
function truncate(name: string, length = 12) {
  return name.length > length ? `${name.slice(0, length)}…` : name
}

/** ヘッダーの店舗切替。店舗一覧 + 「店舗を追加」 */
export function TenantSwitcher({ tenant, tenants }: Props) {
  return (
    <Menu position="bottom-start" withinPortal>
      <MenuTarget>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          px="xs"
          rightSection={<IconChevronDown size={14} />}
        >
          <Text fw={650} size="sm" lh={1}>
            {truncate(tenant.name)}
          </Text>
        </Button>
      </MenuTarget>
      <MenuDropdown>
        {tenants.map((item) => (
          <MenuItem
            key={item.id}
            component={Link}
            href={`/tenants/${item.id}`}
            // 先読みすると proxy が「その店舗を開いた」と見なして直近店舗の cookie を
            // 書き替えてしまう（メニューを開いただけで着地先が変わる）。005 §3.3
            prefetch={false}
            leftSection={
              item.id === tenant.id ? <IconCheck size={16} /> : <span style={{ width: 16 }} />
            }
          >
            {item.name}
          </MenuItem>
        ))}
        <MenuDivider />
        <MenuItem component={Link} href="/tenants/new" leftSection={<IconPlus size={16} />}>
          店舗を追加
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
