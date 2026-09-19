import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { dateStringSchema, dateTermSchema, dateTermShape, refineTerm } from './date'

describe('dateStringSchema', () => {
  it('YYYY-MM-DD を通す', () => {
    expect(dateStringSchema.parse('2026-09-18')).toBe('2026-09-18')
  })

  it('存在しない日付・形式違いは日本語で弾く', () => {
    for (const value of ['2026-02-30', '2026/09/18', '2026-9-8', '']) {
      const result = dateStringSchema.safeParse(value)
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toBe('日付が正しくありません')
    }
  })

  it('文字列でない値も日本語で弾く（006 §3.12）', () => {
    const result = dateStringSchema.safeParse(null)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('日付が正しくありません')
  })
})

describe('dateTermSchema', () => {
  it('表示期間を通す（1 日 / 31 日ちょうど）', () => {
    expect(dateTermSchema.parse({ start: '2026-09-18', end: '2026-09-18' }).end).toBe('2026-09-18')
    expect(() => dateTermSchema.parse({ start: '2026-10-01', end: '2026-10-31' })).not.toThrow()
  })

  it('32 日は弾く（daysBetween は両端を含むので 31 が上限）', () => {
    const result = dateTermSchema.safeParse({ start: '2026-10-01', end: '2026-11-01' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('end が start より前なら弾く', () => {
    const result = dateTermSchema.safeParse({ start: '2026-09-30', end: '2026-09-01' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('日付として不正なら日付のメッセージになる', () => {
    const result = dateTermSchema.safeParse({ start: '2026-02-30', end: '2026-03-01' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('日付が正しくありません')
  })

  it('列を足した object にも同じ規則を掛けられる（refineTerm。008 §10.15）', () => {
    const extended = refineTerm(z.object({ tenantId: z.string(), ...dateTermShape }))
    const result = extended.safeParse({ start: '2026-09-30', end: '2026-09-01', tenantId: 'x' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })
})
