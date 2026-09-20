import { describe, expect, it } from 'vitest'
import { csvContentType, encodeCsv, resolveCsvEncoding } from './encode'

describe('resolveCsvEncoding', () => {
  it('`utf8` のときだけ UTF-8（v1 の `params[:encoding] == "utf8"`）', () => {
    expect(resolveCsvEncoding('utf8')).toBe('utf8')
  })

  it('それ以外はすべて CP932', () => {
    expect(resolveCsvEncoding(null)).toBe('cp932')
    expect(resolveCsvEncoding('')).toBe('cp932')
    expect(resolveCsvEncoding('UTF8')).toBe('cp932')
    expect(resolveCsvEncoding('utf-8')).toBe('cp932')
    expect(resolveCsvEncoding('cp932')).toBe('cp932')
  })
})

describe('csvContentType', () => {
  it('charset を明示する', () => {
    expect(csvContentType('cp932')).toBe('text/csv; charset=Shift_JIS')
    expect(csvContentType('utf8')).toBe('text/csv; charset=utf-8')
  })
})

describe('encodeCsv', () => {
  it('CP932 のバイト列にする', () => {
    expect(encodeCsv('あ', 'cp932').toString('hex')).toBe('82a0')
  })

  it('ASCII はそのまま 1 バイト', () => {
    expect(encodeCsv('a,b\n', 'cp932').toString('hex')).toBe('612c620a')
  })

  it('UTF-8 は BOM を先頭に付ける', () => {
    const buffer = encodeCsv('あ', 'utf8')
    expect(buffer.subarray(0, 3).toString('hex')).toBe('efbbbf')
    expect(buffer.subarray(3).toString('utf8')).toBe('あ')
  })

  it('CP932 には BOM を付けない', () => {
    expect(encodeCsv('a', 'cp932').toString('hex')).toBe('61')
  })

  it('CP932 に無い文字（絵文字）は `〓`（0x81AC）にする', () => {
    expect(encodeCsv('😀', 'cp932').toString('hex')).toBe('81ac')
  })

  it('サロゲートペアの漢字も 1 文字として `〓` 1 つにする（列がずれない）', () => {
    expect(encodeCsv('a𠮟b', 'cp932').toString('hex')).toBe('6181ac62')
  })

  it('CP932 にある外字・丸数字はそのまま通す', () => {
    expect(encodeCsv('髙﨑濵①', 'cp932').toString('hex')).toBe('fbfcfab1fb4d8740')
  })

  it('ユーザーが入力した `?` は `〓` にしない', () => {
    expect(encodeCsv('a?b', 'cp932').toString('hex')).toBe('613f62')
  })

  it('UTF-8 なら絵文字はそのまま残る', () => {
    expect(encodeCsv('😀', 'utf8').subarray(3).toString('utf8')).toBe('😀')
  })
})
