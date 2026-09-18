import { describe, expect, it } from 'vitest'
import { assignShiftSchema } from './shifts'

const base = {
  tenantId: '22222222-2222-2222-2222-222222222222',
  staffId: '44444444-4444-4444-4444-000000000001',
  date: '2026-09-18',
  patternId: '33333333-3333-3333-3333-000000000001',
  fixed: false,
}

describe('assignShiftSchema', () => {
  it('アサインを通す', () => {
    expect(assignShiftSchema.parse(base).patternId).toBe(base.patternId)
  })

  it('patternId が null（空）を通す', () => {
    expect(assignShiftSchema.parse({ ...base, patternId: null }).patternId).toBeNull()
  })

  // seed / pgTAP の id は RFC 9562 の version ビットを満たさない（AGENTS.md）
  it('seed の id（z.uuid() が弾く形）を通す', () => {
    expect(() => assignShiftSchema.parse(base)).not.toThrow()
  })

  it('id が uuid でなければ日本語で弾く', () => {
    const result = assignShiftSchema.safeParse({ ...base, staffId: 'not-a-uuid' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('スタッフが見つかりません')
  })

  it('fixed が boolean でなければ日本語で弾く', () => {
    const result = assignShiftSchema.safeParse({ ...base, fixed: 'true' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('下書き / 確定の指定が正しくありません')
  })
})
