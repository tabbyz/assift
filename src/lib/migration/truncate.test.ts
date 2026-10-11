import { describe, expect, it } from 'vitest'
import { charLength, truncate } from './truncate'

describe('charLength', () => {
  it('コードポイントで数える（char_length と同じ）', () => {
    expect(charLength('')).toBe(0)
    expect(charLength('abc')).toBe(3)
    expect(charLength('小石川ストア')).toBe(6)
    // サロゲートペア: String#length は 2 だが char_length は 1
    expect('😀'.length).toBe(2)
    expect(charLength('😀')).toBe(1)
    expect(charLength('𠮷野家')).toBe(3)
  })
})

describe('truncate', () => {
  it('上限以下はそのまま', () => {
    expect(truncate('店舗', 20)).toEqual({ value: '店舗', truncated: false, before: 2, after: 2 })
  })

  it('先に trim する', () => {
    expect(truncate('  店舗  ', 20)).toEqual({
      value: '店舗',
      truncated: false,
      before: 2,
      after: 2,
    })
    // trim で上限に収まる
    expect(truncate(' 123456 ', 6).truncated).toBe(false)
  })

  it('上限を超えたらコードポイントで切る', () => {
    const r = truncate('あいうえおかきくけこさ', 10)
    expect(r).toEqual({ value: 'あいうえおかきくけこ', truncated: true, before: 11, after: 10 })
  })

  it('サロゲートペアを途中で切らない', () => {
    const r = truncate('😀😀😀', 2)
    expect(r.value).toBe('😀😀')
    expect(r.before).toBe(3)
    expect(r.after).toBe(2)
  })

  it('空文字は空のまま（空の扱いは呼び出し側が決める）', () => {
    expect(truncate('   ', 10)).toEqual({ value: '', truncated: false, before: 0, after: 0 })
  })
})
