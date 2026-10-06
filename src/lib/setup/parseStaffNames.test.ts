import { describe, expect, it } from 'vitest'
import { parseStaffNames, SETUP_STAFFS_MAX } from './parseStaffNames'

describe('parseStaffNames', () => {
  it('改行・タブ・読点・カンマで分ける', () => {
    expect(parseStaffNames('山田\n佐藤\r\n鈴木\t田中、高橋,伊藤，渡辺').names).toEqual([
      '山田',
      '佐藤',
      '鈴木',
      '田中',
      '高橋',
      '伊藤',
      '渡辺',
    ])
  })

  it('空白を含む名前を割らない', () => {
    expect(parseStaffNames('山田 花子\n佐藤　健').names).toEqual(['山田 花子', '佐藤　健'])
  })

  it('前後の空白（全角も）を落とし、空の行を捨てる', () => {
    expect(parseStaffNames('\n　山田　\n\n  \n佐藤\n').names).toEqual(['山田', '佐藤'])
  })

  it('11 文字はエラー。行番号は空の行を飛ばして数える', () => {
    const result = parseStaffNames('山田\n\nあいうえおかきくけこさ')
    expect(result.errors).toEqual([{ line: 2, name: 'あいうえおかきくけこさ' }])
    expect(parseStaffNames('あいうえおかきくけこ').errors).toEqual([])
  })

  it('同じ名前は duplicates に出て、names には両方残る', () => {
    const result = parseStaffNames('佐藤\n山田\n佐藤')
    expect(result.names).toEqual(['佐藤', '山田', '佐藤'])
    expect(result.duplicates).toEqual([{ name: '佐藤', lines: [1, 3] }])
    expect(result.errors).toEqual([])
  })

  it(`${SETUP_STAFFS_MAX + 1} 人は多すぎる`, () => {
    const names = (n: number) => Array.from({ length: n }, (_, i) => `人${i}`).join('\n')
    expect(parseStaffNames(names(SETUP_STAFFS_MAX)).tooMany).toBe(false)
    expect(parseStaffNames(names(SETUP_STAFFS_MAX + 1)).tooMany).toBe(true)
  })

  it('空なら何も無い', () => {
    expect(parseStaffNames('')).toEqual({ names: [], errors: [], duplicates: [], tooMany: false })
  })
})
