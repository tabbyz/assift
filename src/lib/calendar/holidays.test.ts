import { describe, expect, it } from 'vitest'
import { holidaysIn, isHolidayDate } from './holidays'

describe('isHolidayDate', () => {
  it('祝日を判定する', () => {
    expect(isHolidayDate('2026-01-01')).toBe(true) // 元日
    expect(isHolidayDate('2026-09-21')).toBe(true) // 敬老の日
    expect(isHolidayDate('2026-09-18')).toBe(false)
  })

  it('振替休日も祝日として扱う（v1 の business_time と同じ）', () => {
    expect(isHolidayDate('2026-05-06')).toBe(true) // みどりの日 振替休日
  })

  it('プロトタイプ上のキーで true にならない', () => {
    expect(isHolidayDate('constructor')).toBe(false)
    expect(isHolidayDate('toString')).toBe(false)
    expect(isHolidayDate('__proto__')).toBe(false)
  })

  it('範囲外の年は false（データは 1970〜2050）', () => {
    expect(isHolidayDate('2051-01-01')).toBe(false)
  })
})

describe('holidaysIn', () => {
  it('祝日だけを入力順で返す', () => {
    expect(
      holidaysIn(['2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'])
    ).toEqual(['2026-09-21', '2026-09-22', '2026-09-23'])
  })

  it('祝日が無ければ空', () => {
    expect(holidaysIn(['2026-09-18'])).toEqual([])
    expect(holidaysIn([])).toEqual([])
  })
})
