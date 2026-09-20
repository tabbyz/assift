import { describe, expect, it } from 'vitest'
import { dateRange } from './dateRange'
import { formatPeriodTitle } from './periodTitle'

describe('formatPeriodTitle', () => {
  it('1 か月で月初〜月末なら年月だけ', () => {
    expect(formatPeriodTitle('month', dateRange('month', 1, '2026-09-01'))).toBe('2026年9月')
  })

  it('1 か月でも開始が 1 日でなければレンジ', () => {
    expect(formatPeriodTitle('month', dateRange('month', 1, '2026-09-15'))).toBe('9/15 〜 10/14')
  })

  it('半月は前半 / 後半', () => {
    expect(formatPeriodTitle('half_month', dateRange('half_month', 1, '2026-09-01'))).toBe(
      '2026年9月 前半'
    )
    expect(formatPeriodTitle('half_month', dateRange('half_month', 1, '2026-09-16'))).toBe(
      '2026年9月 後半'
    )
  })

  it('週と 2 週間はレンジ', () => {
    expect(formatPeriodTitle('week', dateRange('week', 1, '2026-09-14'))).toBe('9/14 〜 9/20')
    expect(formatPeriodTitle('two_week', dateRange('two_week', 1, '2026-09-14'))).toBe(
      '9/14 〜 9/27'
    )
  })
})
