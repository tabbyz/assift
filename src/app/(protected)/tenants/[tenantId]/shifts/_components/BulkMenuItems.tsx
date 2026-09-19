'use client'

import { MenuItem } from '@mantine/core'
import { IconEraser, IconSquare, IconSquareCheck } from '@tabler/icons-react'
import { BULK_COPY, BULK_KINDS, type BulkKind } from '../_lib/bulkOperations'

const ICONS: Record<BulkKind, React.ReactNode> = {
  fix: <IconSquareCheck size={16} />,
  unfix: <IconSquare size={16} />,
  clear: <IconEraser size={16} />,
}

type Props = { onBulk: (kind: BulkKind) => void }

/**
 * 一括操作 3 件のメニュー項目。ツールメニュー（全体）とスタッフ名メニュー（スタッフ単位）で共有する。
 * 文言は `BULK_COPY.title`（確認ダイアログの見出しと同じ）。押せなくするのは親のメニューボタン側で行う
 * （Mantine の Menu 自体に disabled は無く、実行中はメニューを開かせないのが揃った挙動）。
 */
export function BulkMenuItems({ onBulk }: Props) {
  return BULK_KINDS.map((kind) => (
    <MenuItem key={kind} leftSection={ICONS[kind]} onClick={() => onBulk(kind)}>
      {BULK_COPY[kind].title}
    </MenuItem>
  ))
}
