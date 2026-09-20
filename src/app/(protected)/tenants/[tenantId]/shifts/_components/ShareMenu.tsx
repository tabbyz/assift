'use client'

import { ActionIcon, Menu, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import { IconLink, IconShare } from '@tabler/icons-react'

type Props = { onOpenShare: () => void; disabled: boolean }

/**
 * ツールバーの「共有」メニュー（v1 `_toolbar.html.slim` の dropdown-menu-share）。
 * 010 が区切り線 + PDF / CSV をこの下に足す（v1 と同じ並び）。
 */
export function ShareMenu({ onOpenShare, disabled }: Props) {
  return (
    <Menu position="bottom-end" withinPortal>
      {/* Tooltip で包まない（Menu が注入する aria が子に届かなくなる。007 §10.6 / ToolsMenu と同じ） */}
      <MenuTarget>
        <ActionIcon variant="default" size="lg" aria-label="共有" title="共有" disabled={disabled}>
          <IconShare size={18} />
        </ActionIcon>
      </MenuTarget>

      <MenuDropdown>
        <MenuItem leftSection={<IconLink size={16} />} onClick={onOpenShare}>
          URLでシフト表を共有
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
