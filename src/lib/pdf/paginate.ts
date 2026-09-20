/** 1 ページに載せるスタッフ行数（v1 `index.pdf.slim` の `each_slice(13)`） */
export const PDF_ROWS_PER_PAGE = 13

/**
 * 行をページごとに分ける（010 §5.5）。
 *
 * **空でも 1 ページ返す**。スタッフ 0 人の店舗では見出しと日付行だけの PDF になるが、
 * 中身のない PDF（v1 の `each_slice` は空配列を返していた）より状況が分かる。
 */
export function chunkRows<T>(rows: T[], size: number = PDF_ROWS_PER_PAGE): T[][] {
  if (rows.length === 0) return [[]]

  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}
