import type { CSSProperties } from 'react'
import {
  FIXED_PAPER,
  fixedTextColor,
  inkColor,
  isWhitePattern,
  NEUTRAL_OUTLINE,
  tintColor,
} from '@/lib/patterns/colors'

export type CellPattern = { name: string; colorHex: string }

/**
 * セルの色。保護ルートのボタン（`ShiftCell`）と公開ページの `<div>` で共有する。
 *
 * - 空のセル: 何も当てない（CSS の既定）
 * - 下書き: パターン色の淡塗り + 同系の濃い文字（`tintColor` / `inkColor`）
 * - 確定: パターン色でベタ塗り、輝度でインクを切る（太字は CSS の `[data-fixed]`）
 *
 * 下書きを枠線だけにしていたときは、離れて見るとパターンを読めなかった。**塗りの濃さで
 * 下書きと確定を分ける**ことで、どちらも色がセル全面に出る。
 *
 * 白いパターンだけは塗りでは見分けられないので、中立の枠線で輪郭を作る
 * （下書きは破線、確定は実線）。
 *
 * 色はユーザーデータなので CSS Modules では書けず inline style になる。
 */
export function cellStyle(
  pattern: CellPattern | undefined,
  fixed: boolean
): CSSProperties | undefined {
  if (!pattern) return undefined

  if (isWhitePattern(pattern.colorHex)) {
    return {
      backgroundColor: FIXED_PAPER,
      borderColor: NEUTRAL_OUTLINE,
      borderStyle: fixed ? 'solid' : 'dashed',
    }
  }

  if (!fixed) {
    return { backgroundColor: tintColor(pattern.colorHex), color: inkColor(pattern.colorHex) }
  }

  return {
    backgroundColor: pattern.colorHex,
    color: fixedTextColor(pattern.colorHex),
  }
}

/**
 * 表の下の凡例チップ。下書きセルと同じ淡塗りにして、表の中の色とそのまま結ぶ。
 */
export function chipStyle(colorHex: string): CSSProperties {
  if (isWhitePattern(colorHex)) {
    return { backgroundColor: FIXED_PAPER, borderColor: NEUTRAL_OUTLINE }
  }
  return {
    backgroundColor: tintColor(colorHex),
    color: inkColor(colorHex),
    borderColor: 'transparent',
  }
}

/**
 * アサイン候補のボタン。下書き / 確定のどちらで押すかに合わせて、セルと同じ塗りにする。
 *
 * 色付きはボタン側の 2px 枠を消す（塗りが輪郭）。白いパターンだけ枠を残す
 * （下書きは破線、確定は実線）。
 */
export function choiceStyle(colorHex: string, fixed: boolean): CSSProperties {
  const style = cellStyle({ name: '', colorHex }, fixed)
  if (!style) return {}
  if (isWhitePattern(colorHex)) return style
  return { ...style, borderColor: 'transparent' }
}
