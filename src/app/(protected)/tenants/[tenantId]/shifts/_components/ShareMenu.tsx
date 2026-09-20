'use client'

import { ActionIcon, Menu, MenuDivider, MenuDropdown, MenuItem, MenuTarget } from '@mantine/core'
import { IconFileTypeCsv, IconFileTypePdf, IconLink, IconShare } from '@tabler/icons-react'

type Props = { tenantId: string; start: string; onOpenShare: () => void; disabled: boolean }

/**
 * ツールバーの「共有」メニュー（v1 `_toolbar.html.slim` の dropdown-menu-share）。
 * 区切り線の下に PDF / CSV を並べる（v1 と同じ並び。010 §5.6）。
 */
export function ShareMenu({ tenantId, start, onOpenShare, disabled }: Props) {
  // 期間はサーバーが店舗の作成周期から組み直す。`start` は正規化後の開始日（010 §3.1）
  const exportUrl = (kind: 'pdf' | 'csv') =>
    `/api/tenants/${tenantId}/shifts/${kind}?start=${start}`

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

        <MenuDivider />

        {/*
          Route Handler は Next のページではないので `next/link` では飛ばさない（素の <a>）。
          PDF は v1 と同じく別タブ（`Content-Disposition: inline`）、CSV はダウンロード（`attachment`）。
          キャッシュバスターは付けない（`Date.now()` を href に入れるとハイドレーション不一致になる。§3.10）
        */}
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
