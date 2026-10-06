import { describe, expect, it } from 'vitest'
import { demoWeekStart } from './demoWeek'

describe('demoWeekStart', () => {
  it('平日なら翌週の月曜', () => {
    // 2026-10-06 は火曜
    expect(demoWeekStart('2026-10-06')).toBe('2026-10-12')
    expect(demoWeekStart('2026-10-09')).toBe('2026-10-12')
  })

  it('月曜でも翌週', () => {
    expect(demoWeekStart('2026-10-05')).toBe('2026-10-12')
  })

  it('日曜は翌日の月曜', () => {
    expect(demoWeekStart('2026-10-11')).toBe('2026-10-12')
  })

  it('月や年をまたぐ', () => {
    expect(demoWeekStart('2026-12-30')).toBe('2027-01-04')
  })
})
