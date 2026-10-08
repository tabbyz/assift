import { describe, expect, it } from 'vitest'
import { isTrialActive, trialDaysLeft, trialEndFrom, trialLastDay, trialProgress } from './trial'

describe('trialEndFrom', () => {
  it('10/10 に始めると 12/31 まで（終わりは 1/1 0:00 JST）', () => {
    const end = trialEndFrom(new Date('2026-10-10T12:00:00+09:00'))
    expect(end.toISOString()).toBe(new Date('2027-01-01T00:00:00+09:00').toISOString())
    expect(trialLastDay(end)).toBe('2026-12-31')
  })

  it('月の初日でも月末でも、その月から数える', () => {
    expect(trialLastDay(trialEndFrom(new Date('2026-10-01T00:00:00+09:00')))).toBe('2026-12-31')
    expect(trialLastDay(trialEndFrom(new Date('2026-10-31T23:59:00+09:00')))).toBe('2026-12-31')
  })

  it('JST で数える（UTC の 10/31 15:30 は JST の 11/1）', () => {
    expect(trialLastDay(trialEndFrom(new Date('2026-10-31T15:30:00Z')))).toBe('2027-01-31')
  })

  it('年またぎと閏年', () => {
    expect(trialLastDay(trialEndFrom(new Date('2026-11-15T09:00:00+09:00')))).toBe('2027-01-31')
    expect(trialLastDay(trialEndFrom(new Date('2027-12-20T09:00:00+09:00')))).toBe('2028-02-29')
  })
})

describe('trialLastDay', () => {
  it('v1 から移した月末 23:59:59 JST の終わりも、その日が最終日', () => {
    expect(trialLastDay(new Date('2026-11-30T23:59:59+09:00'))).toBe('2026-11-30')
  })
})

describe('isTrialActive / trialDaysLeft', () => {
  const end = new Date('2027-01-01T00:00:00+09:00')

  it('終わりの瞬間で終わる', () => {
    expect(isTrialActive(end, new Date('2026-12-31T23:59:59+09:00'))).toBe(true)
    expect(isTrialActive(end, new Date('2027-01-01T00:00:00+09:00'))).toBe(false)
    expect(isTrialActive(null, new Date())).toBe(false)
  })

  it('残り日数は今日を含めない', () => {
    expect(trialDaysLeft(end, new Date('2026-12-31T10:00:00+09:00'))).toBe(0)
    expect(trialDaysLeft(end, new Date('2026-12-24T10:00:00+09:00'))).toBe(7)
  })
})

describe('trialProgress', () => {
  const end = new Date('2027-01-01T00:00:00+09:00') // 12/31 まで（10 月に始めた）

  it('始めた月の 1 日が 0、最終日が 1', () => {
    expect(trialProgress(end, new Date('2026-10-01T09:00:00+09:00'))).toBe(0)
    expect(trialProgress(end, new Date('2026-12-31T23:00:00+09:00'))).toBe(1)
  })

  it('途中は日数の割合（JST の日付で数える）', () => {
    expect(trialProgress(end, new Date('2026-11-15T09:00:00+09:00'))).toBeCloseTo(45 / 91)
  })

  it('範囲の外は 0〜1 に収める', () => {
    expect(trialProgress(end, new Date('2026-09-20T09:00:00+09:00'))).toBe(0)
    expect(trialProgress(end, new Date('2027-02-01T09:00:00+09:00'))).toBe(1)
  })
})
