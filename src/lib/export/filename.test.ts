import { describe, expect, it } from 'vitest'
import { contentDisposition, csvFilename, pdfFilename } from './filename'

describe('csvFilename / pdfFilename', () => {
  it('v1 と同じ `_YYYYMMDD-YYYYMMDD` を付ける', () => {
    expect(csvFilename('2026-09-01', '2026-09-30')).toBe('shifts_20260901-20260930.csv')
    expect(pdfFilename('2026-09-01', '2026-09-30')).toBe('勤務シフト表_20260901-20260930.pdf')
  })

  it('1 桁の月日も 0 埋めのまま（`YYYY-MM-DD` からハイフンを抜くだけ）', () => {
    expect(csvFilename('2026-01-05', '2026-01-11')).toBe('shifts_20260105-20260111.csv')
  })

  it('年をまたぐ期間', () => {
    expect(csvFilename('2026-12-28', '2027-01-03')).toBe('shifts_20261228-20270103.csv')
  })
})

describe('contentDisposition', () => {
  it('ASCII のファイル名と RFC 5987 のパーセントエンコードを併記する', () => {
    const value = contentDisposition(
      'inline',
      '勤務シフト表_20260901-20260930.pdf',
      'shifts_20260901-20260930.pdf'
    )
    expect(value).toBe(
      'inline; filename="shifts_20260901-20260930.pdf"; ' +
        "filename*=UTF-8''%E5%8B%A4%E5%8B%99%E3%82%B7%E3%83%95%E3%83%88%E8%A1%A8_20260901-20260930.pdf"
    )
  })

  it('attachment も同じ形', () => {
    const name = 'shifts_20260901-20260930.csv'
    expect(contentDisposition('attachment', name, name)).toBe(
      `attachment; filename="${name}"; filename*=UTF-8''${name}`
    )
  })

  it('ヘッダを壊す `"` はパーセントエンコードされる', () => {
    // ASCII フォールバックはアプリが組み立てた固定書式しか渡さないので、見るのは RFC 5987 側
    expect(contentDisposition('attachment', 'a"b.csv', 'ab.csv')).toContain(
      "filename*=UTF-8''a%22b.csv"
    )
  })

  it("RFC 5987 で特別扱いされる `'` `(` `)` `!` `*` もパーセントエンコードする", () => {
    expect(contentDisposition('inline', "a'()!*.pdf", 'a.pdf')).toContain(
      "filename*=UTF-8''a%27%28%29%21%2A.pdf"
    )
  })
})
