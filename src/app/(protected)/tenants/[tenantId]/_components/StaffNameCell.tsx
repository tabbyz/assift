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
import type { BulkKind } from '../_lib/bulkOperations'
import { BulkMenuItems } from './BulkMenuItems'
import classes from '@/components/shiftTable/ShiftTable.module.css'

type Props = {
  tenantId: string
  staffId: string
  name: string
  workdays: number
  onBulk: (kind: BulkKind) => void
  /** 一括操作の実行中だけ。期間移動中は「スタッフ情報を編集」へ行けるように開けたままにする（008 §10.11） */
  disabled: boolean
}

/**
 * スタッフ名のセル（v1 `_staff.html.slim` の dropdown）。
 * 一括操作はこのスタッフの分だけに効く（008）。
 */
export function StaffNameCell({ tenantId, staffId, name, workdays, onBulk, disabled }: Props) {
  return (
    <Menu position="bottom-start" withinPortal>
      <MenuTarget>
        <UnstyledButton
          className={classes.menuButton}
          aria-label={`${name} のメニュー（勤務 ${workdays} 日）`}
          disabled={disabled}
        >
          <span className={classes.staffNameText}>{name}</span>
          {/* 単位を付けて「4」が何の数かを示す。幅は CSS が 2 桁ぶんで固定する */}
          <span className={classes.workdays}>{workdays}日</span>
          <IconDotsVertical size={14} className={classes.menuIcon} />
        </UnstyledButton>
      </MenuTarget>
      <MenuDropdown>
        {/* 何十行もある表で Portal に開くので、誰のメニューかを見出しに残す（007 と同じ） */}
        <MenuLabel>{name}</MenuLabel>
        <MenuLabel>一括操作</MenuLabel>
        <BulkMenuItems onBulk={onBulk} />

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
