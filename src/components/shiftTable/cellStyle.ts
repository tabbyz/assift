import type { CSSProperties } from 'react'
import { fixedTextColor } from '@/lib/patterns/colors'

export type CellPattern = { name: string; colorHex: string }

/**
 * セルの色（v1 `style_shift_*`）。保護ルートのボタン（`ShiftCell`）と公開ページの `<div>` で共有する。
 *
 * - 空のセル: 何も当てない（CSS の既定）
 * - 下書き: 枠をパターン色にする（上辺だけ 3px にするのは CSS の `[data-assigned]`）
 * - 確定: パターン色で塗り、白文字（白いパターンだけは既定の文字色のまま）
 *
 * 色はユーザーデータなので CSS Modules では書けず inline style になる。
 */
export function cellStyle(
  pattern: CellPattern | undefined,
  fixed: boolean
): CSSProperties | undefined {
  if (!pattern) return undefined
  if (!fixed) return { borderColor: pattern.colorHex }
  return {
    borderColor: pattern.colorHex,
    backgroundColor: pattern.colorHex,
    color: fixedTextColor(pattern.colorHex),
  }
}
