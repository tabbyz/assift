import { describe, expect, it } from 'vitest'
import { chunkRows, PDF_ROWS_PER_PAGE } from './paginate'

const rows = (count: number) => Array.from({ length: count }, (_, i) => i)

describe('chunkRows', () => {
  it('v1 と同じ 13 行ごとに分ける', () => {
    expect(PDF_ROWS_PER_PAGE).toBe(13)
  })

  it('スタッフ 0 人でも 1 ページ返す（見出しと日付行だけの PDF にする）', () => {
    expect(chunkRows([])).toEqual([[]])
  })

  it('13 人はちょうど 1 ページ', () => {
    const chunks = chunkRows(rows(13))
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(13)
  })

  it('14 人で 2 ページ目に割れる', () => {
    const chunks = chunkRows(rows(14))
    expect(chunks).toHaveLength(2)
    expect(chunks[1]).toEqual([13])
  })

  it('27 人は 3 ページ（13 / 13 / 1）', () => {
    expect(chunkRows(rows(27)).map((chunk) => chunk.length)).toEqual([13, 13, 1])
  })

  it('行の順序と中身は変えない', () => {
    expect(chunkRows(rows(5), 2)).toEqual([[0, 1], [2, 3], [4]])
  })
})
