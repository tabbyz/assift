import { describe, expect, it } from 'vitest'
import { sharePeriodLabel, splitShareUrl, splitYearPrefix } from './shareLabels'

describe('sharePeriodLabel', () => {
  it('年が同じ終了日は月日だけ', () => {
    expect(sharePeriodLabel({ start: '2026-10-01', end: '2026-10-31' })).toBe('2026/10/1 〜 10/31')
  })

  it('年をまたぐ期間は終了日にも年を付ける', () => {
    expect(sharePeriodLabel({ start: '2026-12-28', end: '2027-01-03' })).toBe(
      '2026/12/28 〜 2027/1/3'
    )
  })

  it('baseYear と同じ年なら開始日の年も落とす', () => {
    expect(sharePeriodLabel({ start: '2026-09-01', end: '2026-09-30' }, '2026')).toBe('9/1 〜 9/30')
  })

  it('baseYear と違う年は年を残す', () => {
    expect(sharePeriodLabel({ start: '2025-12-01', end: '2025-12-31' }, '2026')).toBe(
      '2025/12/1 〜 12/31'
    )
  })

  it('年をまたぐ期間は baseYear が同じでも両端に年を残す', () => {
    expect(sharePeriodLabel({ start: '2026-12-28', end: '2027-01-03' }, '2026')).toBe(
      '2026/12/28 〜 2027/1/3'
    )
  })
})

describe('splitShareUrl', () => {
  it('最後の / で前半とコードに分ける', () => {
    expect(splitShareUrl('https://assift.app/share/L3JgkWc2')).toEqual({
      prefix: 'https://assift.app/share/',
      code: 'L3JgkWc2',
    })
  })

  it('つなげると元の URL に戻る', () => {
    const url = 'http://localhost:3000/share/abcd1234'
    const { prefix, code } = splitShareUrl(url)
    expect(prefix + code).toBe(url)
  })
})

describe('splitYearPrefix', () => {
  it('年で始まる表記は年と残りに分ける', () => {
    expect(splitYearPrefix('2026年10月')).toEqual({ year: '2026年', rest: '10月' })
    expect(splitYearPrefix('2026年9月 前半')).toEqual({ year: '2026年', rest: '9月 前半' })
  })

  it('年で始まらない表記はそのまま', () => {
    expect(splitYearPrefix('9/14 〜 9/20')).toEqual({ year: '', rest: '9/14 〜 9/20' })
  })
})
