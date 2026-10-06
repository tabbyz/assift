'use client'

import { Button, Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import { IconFileTypeCsv, IconFileTypePdf, IconLink, IconShare2 } from '@tabler/icons-react'

type Props = { tenantId: string; start: string; onOpenShare: () => void; disabled: boolean }

/**
 * ツールバーの「共有」。URL / PDF / CSV。
 */
export function ShareMenu({ tenantId, start, onOpenShare, disabled }: Props) {
  const exportUrl = (kind: 'pdf' | 'csv') =>
    `/api/tenants/${tenantId}/shifts/${kind}?start=${start}`

  return (
    <Menu position="bottom-end" withinPortal>
      <MenuTarget>
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconShare2 size={16} />}
          disabled={disabled}
        >
          共有
        </Button>
      </MenuTarget>

      <MenuDropdown>
        <MenuItem leftSection={<IconLink size={16} />} onClick={onOpenShare}>
          URLでシフト表を共有
        </MenuItem>

        <MenuDivider />

        <MenuItem
          component="a"
          href={exportUrl('pdf')}
          target="_blank"
          rel="noopener"
          leftSection={<IconFileTypePdf size={16} />}
        >
          PDFファイルを作成
        </MenuItem>

        <MenuItem component="a" href={exportUrl('csv')} leftSection={<IconFileTypeCsv size={16} />}>
          CSVエクスポート
        </MenuItem>
      </MenuDropdown>
    </Menu>
  )
}
