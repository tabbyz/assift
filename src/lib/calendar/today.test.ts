import { describe, expect, it } from 'vitest'
import { todayJst } from './today'

describe('todayJst', () => {
  it('YYYY-MM-DD を返す', () => {
    expect(todayJst()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  // UTC の深夜は JST では翌日。サーバーの TZ に引きずられないことを固定する
  it('UTC 15:00 以降は JST の翌日になる', () => {
    expect(todayJst(new Date('2026-09-17T15:00:00Z'))).toBe('2026-09-18')
    expect(todayJst(new Date('2026-09-17T14:59:59Z'))).toBe('2026-09-17')
  })

  it('年をまたぐ', () => {
    expect(todayJst(new Date('2025-12-31T15:00:00Z'))).toBe('2026-01-01')
  })
})
