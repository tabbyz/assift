import { describe, expect, it } from 'vitest'
import { periodLength, previewDates, previewRangeLabel, samplePattern } from './preview'

// 2026-10-04 は日曜。10/1 は木曜
const TODAY = '2026-10-04'

describe('previewDates', () => {
  it('1ヶ月は今月 1 日から、最大 limit 日', () => {
    const { dates, start, end } = previewDates('month', null, TODAY, 14)
    expect(start).toBe('2026-10-01')
    expect(end).toBe('2026-10-31')
    expect(dates).toHaveLength(14)
    expect(dates[0]).toBe('2026-10-01')
  })

  it('2 週・月曜始まりは、1 日を含む週の月曜から 14 日', () => {
    const { dates, start } = previewDates('two_week', 1, TODAY, 14)
    expect(start).toBe('2026-09-28')
    expect(dates).toHaveLength(14)
  })

  it('週の始まりが未選択なら日曜で見せる', () => {
    expect(previewDates('week', null, TODAY, 14).start).toBe('2026-09-27')
  })
})

describe('samplePattern', () => {
  it('勤務が無ければ空', () => {
    expect(samplePattern(0, 0, [], ['休'])).toBeNull()
  })

  it('決まった並びで、働く日とお休みが混ざる', () => {
    const row = Array.from({ length: 7 }, (_, d) => samplePattern(0, d, ['早', '遅'], ['休']))
    expect(row).toEqual(['早', '遅', '休', '休', '早', '遅', '休'])
    expect(samplePattern(0, 3, ['早', '遅'], ['休'])).toBe(row[3])
  })

  it('お休みが無ければ空にする', () => {
    expect(samplePattern(0, 2, ['早', '遅'], [])).toBeNull()
  })
})

describe('previewRangeLabel', () => {
  it('同じ月なら月を 1 回だけ', () => {
    expect(previewRangeLabel('2026-10-01', '2026-10-31')).toBe('10月1日〜31日')
    expect(previewRangeLabel('2026-09-28', '2026-10-11')).toBe('9月28日〜10月11日')
  })
})

describe('periodLength', () => {
  it('両端を含む日数', () => {
    expect(periodLength('2026-10-01', '2026-10-31')).toBe(31)
    expect(periodLength('2026-10-01', '2026-10-01')).toBe(1)
  })
})
