import { describe, expect, it } from 'vitest'
import { createShareSchema, deleteShareSchema, SHARE_NOT_FOUND_MESSAGE } from './shares'

const tenantId = '22222222-2222-2222-2222-222222222222'

describe('createShareSchema', () => {
  it('表示期間をそのまま通す', () => {
    const parsed = createShareSchema.parse({ tenantId, start: '2026-09-01', end: '2026-09-30' })
    expect(parsed.end).toBe('2026-09-30')
  })

  it('31 日ちょうどは通る', () => {
    expect(() =>
      createShareSchema.parse({ tenantId, start: '2026-10-01', end: '2026-10-31' })
    ).not.toThrow()
  })

  it('31 日を超える期間は切らずに拒否する（v1 は黙って切っていた）', () => {
    const result = createShareSchema.safeParse({ tenantId, start: '2026-09-01', end: '2026-10-05' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('終了日が開始日より前なら弾く', () => {
    const result = createShareSchema.safeParse({ tenantId, start: '2026-09-30', end: '2026-09-01' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('実在しない日付を日本語で弾く', () => {
    const result = createShareSchema.safeParse({ tenantId, start: '2026-02-30', end: '2026-03-01' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('日付が正しくありません')
  })

  it('tenantId が uuid でなければ日本語で弾く', () => {
    const result = createShareSchema.safeParse({
      tenantId: 'x',
      start: '2026-09-01',
      end: '2026-09-30',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('店舗が見つかりません')
  })
})

describe('deleteShareSchema', () => {
  it('seed の id（z.uuid() が弾く形）を通す', () => {
    const shareId = '66666666-6666-6666-6666-000000000001'
    expect(deleteShareSchema.parse({ tenantId, shareId }).shareId).toBe(shareId)
  })

  it('shareId が uuid でなければ日本語で弾く', () => {
    const result = deleteShareSchema.safeParse({ tenantId, shareId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(SHARE_NOT_FOUND_MESSAGE)
  })
})
