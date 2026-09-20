/**
 * mm → pt（010 §5.5）。v1 `shifts/pdf.scss` は wkhtmltopdf 向けに mm で書かれていて、
 * react-pdf の単位は pt。**v1 の寸法をそのまま読める形で残す**ために変換をここに置く。
 *
 * `styles.ts`（react-pdf の `StyleSheet` を読む）とは別ファイルにする。
 * `pdfCellStyle.ts` も帯の幅にこれを使うが、あちらは Vitest の対象なので react-pdf を読ませない。
 */
const PT_PER_MM = 2.8346

export function mm(value: number): number {
  return Math.round(value * PT_PER_MM * 10) / 10
}
