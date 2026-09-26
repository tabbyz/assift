'use client'

import { Button, Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import {
  IconArrowBackUp,
  IconCopy,
  IconSquareRoundedPlus,
  IconTool,
  IconUsersGroup,
} from '@tabler/icons-react'
import type { BulkKind } from '../_lib/bulkOperations'
import { BulkMenuItems } from './BulkMenuItems'

/** 直近の自動アサインを元に戻す（012 §4.5）。その実行の下書きが残っている間だけ出す */
export type AssistUndo = { label: string; onClick: () => void }

type Props = {
  onBulk: (kind: BulkKind) => void
  onSetDefaultPatterns: () => void
  onSetDefaultRequiredNums: () => void
  onOpenCopy: () => void
  assistUndo: AssistUndo | null
  disabled: boolean
}

/**
 * 低頻度の操作。共有はツールバー、集計は表の左上。並びは頻度順。
 */
export function ToolsMenu({
  onBulk,
  onSetDefaultPatterns,
  onSetDefaultRequiredNums,
  onOpenCopy,
  assistUndo,
  disabled,
}: Props) {
  return (
    <Menu position="bottom-end" withinPortal>
      <MenuTarget>
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconTool size={16} />}
          disabled={disabled}
        >
          操作
        </Button>
      </MenuTarget>

      <MenuDropdown>
        <BulkMenuItems onBulk={onBulk} />

        <MenuDivider />

        <MenuItem leftSection={<IconSquareRoundedPlus size={16} />} onClick={onSetDefaultPatterns}>
          デフォルト勤務パターンをセット
        </MenuItem>
        <MenuItem leftSection={<IconUsersGroup size={16} />} onClick={onSetDefaultRequiredNums}>
          デフォルト人数をセット
        </MenuItem>

        <MenuDivider />

        <MenuItem leftSection={<IconCopy size={16} />} onClick={onOpenCopy}>
          シフトを別の期間にコピー
        </MenuItem>

        {assistUndo && (
          <>
            <MenuDivider />
            <MenuItem leftSection={<IconArrowBackUp size={16} />} onClick={assistUndo.onClick}>
              {assistUndo.label}
            </MenuItem>
          </>
        )}
      </MenuDropdown>
    </Menu>
  )
}
