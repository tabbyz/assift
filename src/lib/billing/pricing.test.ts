import { describe, expect, it } from 'vitest'
import { billableStaffCount, LEGACY_DISCOUNT_PERCENT, monthlyPriceYen } from './pricing'

describe('monthlyPriceYen', () => {
  it('10 人までは 0 円', () => {
    expect(monthlyPriceYen(1)).toBe(0)
    expect(monthlyPriceYen(10)).toBe(0)
  })

  it('11 人目から 1 人 100 円', () => {
    expect(monthlyPriceYen(11)).toBe(100)
    expect(monthlyPriceYen(15)).toBe(500)
    expect(monthlyPriceYen(20)).toBe(1000)
    expect(monthlyPriceYen(30)).toBe(2000)
  })

  it('0 人でも負にならない', () => {
    expect(billableStaffCount(0)).toBe(0)
    expect(monthlyPriceYen(0)).toBe(0)
  })

  // v1 の Plan.calc_price(n) = 50 * (n - 10)。旧料金のクーポンで同じ金額になる（019 §2.4）
  it('旧料金のクーポンで v1 の 1 人 50 円と一致する', () => {
    for (const n of [10, 11, 12, 15, 20, 30, 50, 150]) {
      expect(monthlyPriceYen(n, LEGACY_DISCOUNT_PERCENT)).toBe(Math.max(0, 50 * (n - 10)))
    }
  })
})
