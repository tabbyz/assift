import { describe, expect, it } from 'vitest'
import { fixedTextColor, PATTERN_COLORS } from './colors'

describe('fixedTextColor', () => {
  it('白以外は白文字（v1 と同じ）', () => {
    expect(fixedTextColor('#F44336')).toBe('#FFFFFF')
    expect(fixedTextColor('#FFEB3B')).toBe('#FFFFFF')
  })

  it('白は既定の文字色のまま', () => {
    expect(fixedTextColor('#FFFFFF')).toBeUndefined()
    // v1 から移行した行は小文字の hex を持ちうる
    expect(fixedTextColor('#ffffff')).toBeUndefined()
  })

  it('20 色すべてで例外にならない', () => {
    for (const color of PATTERN_COLORS) {
      expect(() => fixedTextColor(color.hex)).not.toThrow()
    }
  })
})
