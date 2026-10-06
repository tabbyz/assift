'use client'

import { Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import {
  IconArrowBackUp,
  IconCopy,
  IconSquareRoundedPlus,
  IconTool,
  IconUsersGroup,
} from '@tabler/icons-react'
import type { BulkKind } from '../_lib/bulkOperations'
import { ToolbarButton } from './ToolbarButton'
import { BulkMenuItems } from './BulkMenuItems'

/** 直近の自動アサインを元に戻す（012 §4.5）。その実行の下書きが残っている間だけ出す */
export type AssistUndo = { label: string; onClick: () => void }

type Props = {
  onBulk: (kind: BulkKind) => void
  onSetDefaultPatterns: () => void
  onResetRequiredNums: () => void
  /** 期間に「この日だけ変えた」日が何日あるか。0 なら戻すものが無いので押せない（015 §3.6） */
  resetRequiredNumsCount: number
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
  onResetRequiredNums,
  resetRequiredNumsCount,
  onOpenCopy,
  assistUndo,
  disabled,
}: Props) {
  return (
    <Menu position="bottom-end" withinPortal>
      <MenuTarget>
        <ToolbarButton leftSection={<IconTool size={16} />} disabled={disabled}>
          操作
        </ToolbarButton>
      </MenuTarget>

      <MenuDropdown>
        <BulkMenuItems onBulk={onBulk} />

        <MenuDivider />

        <MenuItem leftSection={<IconSquareRoundedPlus size={16} />} onClick={onSetDefaultPatterns}>
          デフォルト勤務パターンをセット
        </MenuItem>
        <MenuItem
          leftSection={<IconUsersGroup size={16} />}
          onClick={onResetRequiredNums}
          disabled={resetRequiredNumsCount === 0}
        >
          {resetRequiredNumsCount === 0
            ? 'この期間に個別の変更はありません'
            : `この期間の個別の変更を元に戻す（${resetRequiredNumsCount} 日）`}
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
