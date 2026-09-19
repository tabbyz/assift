'use client'

import { ActionIcon, Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import { IconCopy, IconSquareRoundedPlus, IconTool } from '@tabler/icons-react'
import type { BulkKind } from '../_lib/bulkOperations'
import { BulkMenuItems } from './BulkMenuItems'

type Props = {
  onBulk: (kind: BulkKind) => void
  onSetDefaultPatterns: () => void
  onOpenCopy: () => void
  disabled: boolean
}

/**
 * ツールバーの「ツール」メニュー（v1 `_toolbar.html.slim` の dropdown-menu-tool）。
 * 自動アサインは Phase 1 のスコープ外なので項目ごと置かない（008 §7）。
 */
export function ToolsMenu({ onBulk, onSetDefaultPatterns, onOpenCopy, disabled }: Props) {
  return (
    <Menu position="bottom-end" withinPortal>
      {/*
        Mantine の Tooltip をここに挟まない。Tooltip は子に ref と一部のハンドラしか渡さないので、
        Menu が注入する aria-haspopup / aria-expanded / aria-controls / id がボタンに届かず、
        ドロップダウンの aria-labelledby が存在しない id を指す（実測。007 §10.6 の 3 と同じ種類）。
        hover の説明は title で出す。
      */}
      <MenuTarget>
        <ActionIcon
          variant="default"
          size="lg"
          aria-label="ツール"
          title="ツール"
          disabled={disabled}
        >
          <IconTool size={18} />
        </ActionIcon>
      </MenuTarget>

      <MenuDropdown>
        <BulkMenuItems onBulk={onBulk} />

        <MenuDivider />

        <MenuItem leftSection={<IconSquareRoundedPlus size={16} />} onClick={onSetDefaultPatterns}>
          デフォルト勤務パターンをセット
        </MenuItem>
        <MenuItem leftSection={<IconCopy size={16} />} onClick={onOpenCopy}>
          シフトをコピー
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
