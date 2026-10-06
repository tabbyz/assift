import { describe, expect, it } from 'vitest'
import { billableStaffCount, monthlyPriceYen } from './pricing'

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
})
