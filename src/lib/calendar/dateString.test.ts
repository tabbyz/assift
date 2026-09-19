import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  copyEnd,
  datesBetween,
  daysBetween,
  dayOfMonth,
  diffDays,
  endOfMonth,
  formatJapaneseMonthDay,
  formatMonthDay,
  isDateString,
  startOfMonth,
  wday,
  withDayOfMonth,
} from './dateString'

describe('isDateString', () => {
  it('実在する日付を通す', () => {
    expect(isDateString('2026-09-18')).toBe(true)
    expect(isDateString('2024-02-29')).toBe(true) // 閏年
  })

  it('形式が違うものを弾く', () => {
    expect(isDateString('2026-9-18')).toBe(false)
    expect(isDateString('2026/09/18')).toBe(false)
    expect(isDateString('')).toBe(false)
    expect(isDateString('2026-09-18T00:00:00Z')).toBe(false)
  })

  // dayjs は繰り上げて valid にしてしまうので、往復で判定している
  it('存在しない日付を弾く', () => {
    expect(isDateString('2026-02-30')).toBe(false)
    expect(isDateString('2026-13-01')).toBe(false)
    expect(isDateString('2026-00-10')).toBe(false)
    expect(isDateString('2026-09-31')).toBe(false)
    expect(isDateString('2025-02-29')).toBe(false) // 平年
  })
})

describe('addDays / addMonths', () => {
  it('月と年をまたぐ', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('月末は丸める（v1 の + 1.month と同じ）', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28')
    expect(addMonths('2026-09-01', 1)).toBe('2026-10-01')
  })
})

describe('月の道具', () => {
  it('月初・月末・日を返す', () => {
    expect(startOfMonth('2026-09-18')).toBe('2026-09-01')
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28')
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29')
    expect(dayOfMonth('2026-09-18')).toBe(18)
    expect(withDayOfMonth('2026-09-18', 16)).toBe('2026-09-16')
  })
})

describe('wday', () => {
  it('0 = 日曜', () => {
    expect(wday('2026-09-20')).toBe(0)
    expect(wday('2026-09-18')).toBe(5)
  })
})

describe('datesBetween / daysBetween', () => {
  it('両端を含む', () => {
    expect(datesBetween('2026-09-29', '2026-10-02')).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(datesBetween('2026-09-18', '2026-09-18')).toEqual(['2026-09-18'])
    expect(daysBetween('2026-09-18', '2026-09-18')).toBe(1)
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(30)
  })

  it('end が start より前なら空', () => {
    expect(datesBetween('2026-09-18', '2026-09-17')).toEqual([])
  })
})

describe('diffDays', () => {
  it('符号付きの差。daysBetween（両端を含む）とは 1 ずれる', () => {
    expect(diffDays('2026-09-01', '2026-09-01')).toBe(0)
    expect(diffDays('2026-09-01', '2026-09-05')).toBe(4)
    expect(daysBetween('2026-09-01', '2026-09-05')).toBe(5)
  })

  it('過去方向は負になる（コピーのオフセットで使う）', () => {
    expect(diffDays('2026-09-01', '2026-08-30')).toBe(-2)
  })

  it('月・年をまたいでも日数で数える', () => {
    expect(diffDays('2026-09-01', '2026-10-01')).toBe(30)
    expect(diffDays('2026-12-31', '2027-01-01')).toBe(1)
  })
})

describe('copyEnd', () => {
  it('From の長さを To の開始日から伸ばす', () => {
    expect(copyEnd('2026-09-01', '2026-09-30', '2026-10-01')).toBe('2026-10-30')
  })
  it('From が 1 日なら To の終了日は開始日と同じ', () => {
    expect(copyEnd('2026-09-18', '2026-09-18', '2026-10-05')).toBe('2026-10-05')
  })
  it('日数で伸ばすので、月の長さが違っても From と同じ日数になる', () => {
    // From は 10/1〜10/31 の 31 日間。11 月は 30 日しかないので To の終了日は 12/1 に伸びる
    expect(copyEnd('2026-10-01', '2026-10-31', '2026-11-01')).toBe('2026-12-01')
  })
  it('過去へのコピーでも長さを保つ', () => {
    expect(copyEnd('2026-09-01', '2026-09-30', '2026-08-01')).toBe('2026-08-30')
  })
})

describe('表示用の整形', () => {
  it('v1 と同じ書式', () => {
    expect(formatMonthDay('2026-09-08')).toBe('9/8')
    expect(formatJapaneseMonthDay('2026-09-08')).toBe('9月8日')
  })
})
