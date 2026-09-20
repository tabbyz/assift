import { describe, expect, it } from 'vitest'
import { DEFAULT_PATTERN_COLOR, fixedTextColor, outlineColor, PATTERN_COLORS } from './colors'

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

describe('outlineColor', () => {
  it('白以外はその色をそのまま枠線に使う', () => {
    expect(outlineColor('#F44336')).toBe('#F44336')
  })

  it('白は枠線色を指定しない（白地に白枠で要素ごと消えるのを防ぐ）', () => {
    expect(outlineColor('#FFFFFF')).toBeUndefined()
    // v1 から移行した行は小文字の hex を持ちうる
    expect(outlineColor('#ffffff')).toBeUndefined()
  })

  it('色未設定の既定色（白）も落ちる', () => {
    expect(outlineColor(DEFAULT_PATTERN_COLOR)).toBeUndefined()
  })
})
