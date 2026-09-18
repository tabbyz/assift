import { describe, expect, it } from 'vitest'
import { dayKeyColor, dayKeyFor } from './weekdays'

describe('dayKeyFor', () => {
  it('曜日のキーを返す（0 = 日曜）', () => {
    expect(dayKeyFor('2026-09-20', false)).toBe('0')
    expect(dayKeyFor('2026-09-18', false)).toBe('5')
    expect(dayKeyFor('2026-09-19', false)).toBe('6')
  })

  it('祝日は曜日より優先する（v1 と同じ）', () => {
    expect(dayKeyFor('2026-09-21', true)).toBe('holiday')
    // 日曜が祝日でも holiday
    expect(dayKeyFor('2026-09-20', true)).toBe('holiday')
  })
})

describe('dayKeyColor', () => {
  it('日曜と祝日は赤、土曜は青', () => {
    expect(dayKeyColor('0')).toBe('red')
    expect(dayKeyColor('holiday')).toBe('red')
    expect(dayKeyColor('6')).toBe('blue')
    expect(dayKeyColor('3')).toBeUndefined()
  })
})
