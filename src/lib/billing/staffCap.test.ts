import { describe, expect, it } from 'vitest'
import { minStaffCap, suggestedStaffCap } from './staffCap'

describe('suggestedStaffCap', () => {
  it('在籍数より大きい次の 5 の倍数（最小 15）', () => {
    expect(suggestedStaffCap(0)).toBe(15)
    expect(suggestedStaffCap(8)).toBe(15)
    expect(suggestedStaffCap(12)).toBe(15)
    expect(suggestedStaffCap(14)).toBe(15)
    expect(suggestedStaffCap(15)).toBe(20)
    expect(suggestedStaffCap(23)).toBe(25)
    expect(suggestedStaffCap(112)).toBe(115)
  })

  it('1000 を超えない', () => {
    expect(suggestedStaffCap(998)).toBe(1000)
    expect(suggestedStaffCap(1200)).toBe(1000)
  })
})

describe('minStaffCap', () => {
  it('在籍数と 11 の大きいほう', () => {
    expect(minStaffCap(3)).toBe(11)
    expect(minStaffCap(11)).toBe(11)
    expect(minStaffCap(27)).toBe(27)
  })
})
