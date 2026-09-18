import { describe, expect, it } from 'vitest'
import { dateStringSchema } from './date'

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
