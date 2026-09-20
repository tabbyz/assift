'use client'

import type { Ref } from 'react'
import { UnstyledButton, type ElementProps } from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { cellStyle, type CellPattern } from '@/components/shiftTable/cellStyle'
import classes from '@/components/shiftTable/ShiftTable.module.css'

type Props = ElementProps<'button', 'onClick'> & {
  /** アサイン済みのパターン。無ければ空のセル */
  pattern?: CellPattern
  fixed: boolean
  /** その曜日に勤務できるスタッフか（v1 の `data-enabled`） */
  enabled: boolean
  label: string
  onClick: () => void
  ref?: Ref<HTMLButtonElement>
}

/**
 * `Popover.Target` は子を cloneElement して `aria-haspopup` / `aria-expanded` /
 * `aria-controls` / `id` とマージ済みの `className` を渡してくる。受け取って素通しする。
 * v1 のセルにも `aria-haspopup` / `aria-expanded` が付いていた。
 */

/**
 * シフト表の 1 セル（v1 の `_staff.html.slim` + `shifts/pattern.scss`）。
 *
 * 担当可（薄いグレー + 「+」）/ 担当不可（背景なし）/ 下書き（白地 + 上辺の色帯）/
 * 確定（パターン色で塗り + 太字 + 白文字）の 4 通り。色の規則は `cellStyle()` に置いて公開ページと共有する。
 */
export function ShiftCell({
  pattern,
  fixed,
  enabled,
  label,
  onClick,
  ref,
  className,
  ...rest
}: Props) {
  const assigned = Boolean(pattern)

  return (
    <UnstyledButton
      // 閉じているセルにも付ける（v1 は全セルに `aria-haspopup` を置いていた）。
      // 開いている間は rest の注入値（dialog / aria-expanded / aria-controls）が上書きする
      aria-haspopup="dialog"
      {...rest}
      ref={ref}
      className={className ? `${classes.cell} ${className}` : classes.cell}
      data-assigned={assigned}
      data-enabled={enabled}
      data-fixed={fixed}
      onClick={onClick}
      aria-label={label}
      style={cellStyle(pattern, fixed)}
    >
      {pattern ? pattern.name : enabled && <IconPlus size={14} className={classes.cellPlus} />}
    </UnstyledButton>
  )
}
