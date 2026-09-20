import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PATTERN_COLOR,
  fixedTextColor,
  inkColor,
  isWhitePattern,
  outlineColor,
  PATTERN_COLORS,
  tintColor,
} from './colors'

/** WCAG のコントラスト比。淡塗りとインクの組み合わせを機械的に確かめるために置く */
function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    const [r, g, bl] = channels.map((v) =>
      v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
    )
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('fixedTextColor', () => {
  it('暗いパターンは白文字', () => {
    expect(fixedTextColor('#F44336')).toBe('#FFFFFF')
    expect(fixedTextColor('#2196F3')).toBe('#FFFFFF')
  })

  it('明るいパターンはインク（黄・ライムの白文字をやめる）', () => {
    expect(fixedTextColor('#FFEB3B')).toBe('#1C1917')
    expect(fixedTextColor('#CDDC39')).toBe('#1C1917')
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

describe('tintColor', () => {
  it('パターン色を白で薄める', () => {
    expect(tintColor('#000000')).toBe('#E0E0E0')
    expect(tintColor('#FFFFFF')).toBe('#FFFFFF')
    expect(tintColor('#3F51B5')).toBe('#E8EAF6')
  })

  it('壊れた hex は白に落ちる（画面が真っ黒にならない）', () => {
    expect(tintColor('rgb(0,0,0)')).toBe('#FFFFFF')
  })
})

describe('inkColor', () => {
  it('暗いパターンはそのまま使う（色味を保つ）', () => {
    expect(inkColor('#3F51B5')).toBe('#3F51B5')
  })

  it('明るいパターンは読める濃さまで落とす', () => {
    const ink = inkColor('#FFEB3B')
    expect(ink).not.toBe('#FFEB3B')
    expect(contrastRatio(tintColor('#FFEB3B'), ink)).toBeGreaterThanOrEqual(4.5)
  })

  it('白はインクの既定色', () => {
    expect(inkColor('#FFFFFF')).toBe('#1C1917')
    expect(inkColor('#ffffff')).toBe('#1C1917')
  })

  it('20 色すべてで淡塗りとのコントラストが 4.5:1 を満たす', () => {
    for (const color of PATTERN_COLORS) {
      if (isWhitePattern(color.hex)) continue
      expect(contrastRatio(tintColor(color.hex), inkColor(color.hex))).toBeGreaterThanOrEqual(4.5)
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
