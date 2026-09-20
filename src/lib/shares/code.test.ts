import { describe, expect, it } from 'vitest'
import { generateShareCode, isShareCode, SHARE_CODE_ALPHABET, SHARE_CODE_LENGTH } from './code'

/** 与えたバイト列を順に返す乱数源（要求された長さだけ切り出す） */
function bytesFrom(values: number[]): (n: number) => Uint8Array {
  let cursor = 0
  return (n) => {
    const slice = values.slice(cursor, cursor + n)
    cursor += n
    return Uint8Array.from(slice)
  }
}

describe('SHARE_CODE_ALPHABET', () => {
  it('英数字から 0 O 1 l I i j を除いた 55 文字', () => {
    expect(SHARE_CODE_ALPHABET).toHaveLength(55)
    expect(new Set(SHARE_CODE_ALPHABET).size).toBe(55)
    for (const char of '0O1lIij') expect(SHARE_CODE_ALPHABET).not.toContain(char)
  })
})

describe('generateShareCode', () => {
  it('8 文字で、DB の CHECK と同じ形式を満たす', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateShareCode()
      expect(code).toHaveLength(SHARE_CODE_LENGTH)
      expect(isShareCode(code)).toBe(true)
    }
  })

  it('読み間違えやすい文字を含まない', () => {
    for (let i = 0; i < 200; i++) {
      for (const char of generateShareCode()) expect(SHARE_CODE_ALPHABET).toContain(char)
    }
  })

  it('乱数源を固定すると決定的になる', () => {
    // 0..7 は剰余なしでそのままアルファベットの先頭 8 文字
    expect(generateShareCode(bytesFrom([0, 1, 2, 3, 4, 5, 6, 7]))).toBe('23456789')
  })

  it('剰余は 55 で畳む（55 は先頭の文字に戻る）', () => {
    // 54 → 'z'（末尾）、55 → '2'（先頭に戻る）、56 → '3'
    expect(generateShareCode(bytesFrom([54, 55, 56, 0, 0, 0, 0, 0]))).toBe('z2322222')
  })

  it('220 以上のバイトは捨てて引き直す（剰余バイアスの除去）', () => {
    // 220..255 を挟んでも結果に現れず、そのぶん次のバイトが使われる
    const code = generateShareCode(bytesFrom([220, 255, 0, 1, 2, 3, 4, 5, 6, 7]))
    expect(code).toBe('23456789')
  })

  it('使えるバイトを返さない乱数源では無限ループせずに例外にする', () => {
    expect(() => generateShareCode(() => Uint8Array.from([255, 255, 255, 255]))).toThrow(/乱数源/)
    expect(() => generateShareCode(() => new Uint8Array(0))).toThrow(/乱数源/)
  })
})

describe('isShareCode', () => {
  it('英数字 8 文字だけを通す', () => {
    expect(isShareCode('SEEDSHR1')).toBe(true)
    // v1 由来の 0 / O を含むコードも受ける（55 文字には絞らない）
    expect(isShareCode('0OIl1234')).toBe(true)
    expect(isShareCode('abc')).toBe(false)
    expect(isShareCode('abcdefghi')).toBe(false)
    expect(isShareCode('abcdefg-')).toBe(false)
    expect(isShareCode('')).toBe(false)
  })
})
