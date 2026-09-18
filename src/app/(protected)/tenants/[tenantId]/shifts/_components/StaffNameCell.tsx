'use client'

import Link from 'next/link'
import {
  Menu,
  MenuDivider,
  MenuDropdown,
  MenuItem,
  MenuLabel,
  MenuTarget,
  UnstyledButton,
} from '@mantine/core'
import { IconDotsVertical, IconSettings } from '@tabler/icons-react'
import classes from './CalendarTable.module.css'

type Props = { tenantId: string; staffId: string; name: string }

/**
 * スタッフ名のセル（v1 `_staff.html.slim` の dropdown）。
 * 一括操作（すべて確定 / 下書きに戻す / 下書きクリア）は 008 でこのメニューに足す。
 */
export function StaffNameCell({ tenantId, staffId, name }: Props) {
  return (
    <Menu position="bottom-start" withinPortal>
      <MenuTarget>
        <UnstyledButton className={classes.menuButton} aria-label={`${name} のメニュー`}>
          <span>{name}</span>
          <IconDotsVertical size={14} className={classes.menuIcon} />
        </UnstyledButton>
      </MenuTarget>
      <MenuDropdown>
        <MenuLabel>{name}</MenuLabel>
        <MenuDivider />
        <MenuItem
          component={Link}
          href={`/tenants/${tenantId}/settings/staffs/${staffId}`}
          leftSection={<IconSettings size={16} />}
        >
          スタッフ情報を編集
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
