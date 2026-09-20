import type { Style } from '@react-pdf/types'
import { fixedTextColor } from '@/lib/patterns/colors'
import { mm } from './mm'

/** 下書きの上辺の色帯（v1 の 1.5mm） */
export const DRAFT_BAND_WIDTH = mm(1.5)

export type PdfCellPattern = { colorHex: string }

/**
 * セルの色（010 §3.9）。`CSSProperties` と react-pdf の `Style` は別物なので共用しない。
 * 型を緩めて 1 つにすると「web で効いているつもりの指定が PDF では無視される」壊れ方をする。
 *
 * **011 以降、web の `cellStyle()` とは規則が違う。** web の下書きはパターン色の淡塗りになったが、
 * PDF はここでは v1 のまま（白地 + 上辺の色帯）にしてある。紙は淡い塗りが飛びやすく、
 * 出力を目で確かめてからでないと動かせないため。揃えるときは `pdfDraftBandStyle()` の廃止と
 * `tintColor()` / `inkColor()` の導入を対にして行う。
 *
 * - 空のセル・下書き: 何も当てない（白地 + 既定の文字色。v1 の `background-color: #fff !important` と同じ結果）
 * - 確定: パターン色で塗り、輝度でインクを切る。白いパターンだけは既定の文字色のまま
 *
 * `color` と `fontWeight` はセルの `View` から子の `Text` に継承される（react-pdf で実測）。
 */
export function pdfCellStyle(
  pattern: PdfCellPattern | undefined,
  fixed: boolean
): Style | undefined {
  if (!pattern || !fixed) return undefined

  return {
    backgroundColor: pattern.colorHex,
    color: fixedTextColor(pattern.colorHex),
    fontWeight: 700,
  }
}

/**
 * 下書きの上辺の色帯。**v1 と同じく絶対配置で重ねる**（プランの §5.5 は `borderTopWidth` としていたが、
 * 実装して測ると 3 行目が切れた）。
 *
 * yoga の `height` は border-box なので、行の高さ 11mm（31.2pt）から行の罫線 0.6mm と帯 1.5mm が引かれ、
 * セルの文字領域が 25.2pt しか残らない。本文 8.5pt × `lineHeight: 1` × 3 行 = 25.5pt が入らず、
 * **3 行目が `…` に丸められる**（`@react-pdf/textkit` は高さが足りないと `truncateMode` に関わらず省略する）。
 * 絶対配置なら v1 と同じく帯が高さを食わないので、文字領域は 11mm − 行の罫線のままになる。
 *
 * 確定には出さない（塗りと同じ色になって見えないうえ、v1 も `display: none` にしていた）。
 */
export function pdfDraftBandStyle(
  pattern: PdfCellPattern | undefined,
  fixed: boolean
): Style | undefined {
  if (!pattern || fixed) return undefined

  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: DRAFT_BAND_WIDTH,
    backgroundColor: pattern.colorHex,
  }
}
