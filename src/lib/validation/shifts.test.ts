import { describe, expect, it } from 'vitest'
import {
  assignShiftSchema,
  bulkShiftsSchema,
  clearDraftShiftsSchema,
  copyConditionsSchema,
  copyShiftsSchema,
  setDefaultPatternsSchema,
} from './shifts'

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

const TENANT = '22222222-2222-2222-2222-222222222222'
const STAFF = '44444444-4444-4444-4444-000000000001'
const PATTERN = '33333333-3333-3333-3333-000000000001'
const term = { tenantId: TENANT, start: '2026-09-01', end: '2026-09-30' }

describe('bulkShiftsSchema / clearDraftShiftsSchema', () => {
  it('表示期間の全員を通す（staffId なし）', () => {
    expect(bulkShiftsSchema.parse({ ...term, fixed: true }).staffId).toBeUndefined()
    expect(clearDraftShiftsSchema.parse(term).staffId).toBeUndefined()
  })

  it('スタッフ単位（staffId あり / null）を通す', () => {
    expect(bulkShiftsSchema.parse({ ...term, staffId: STAFF, fixed: false }).staffId).toBe(STAFF)
    expect(bulkShiftsSchema.parse({ ...term, staffId: null, fixed: false }).staffId).toBeNull()
  })

  it('期間の規則を dateTermSchema から引き継ぐ（32 日は弾く）', () => {
    const result = bulkShiftsSchema.safeParse({
      tenantId: TENANT,
      start: '2026-10-01',
      end: '2026-11-01',
      fixed: true,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('staffId が uuid でなければ日本語で弾く', () => {
    const result = bulkShiftsSchema.safeParse({ ...term, staffId: 'not-a-uuid', fixed: true })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('スタッフが見つかりません')
  })

  it('fixed が boolean でなければ日本語で弾く', () => {
    const result = bulkShiftsSchema.safeParse({ ...term, fixed: 'true' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('下書き / 確定の指定が正しくありません')
  })
})

describe('setDefaultPatternsSchema', () => {
  it('表示期間を通す', () => {
    expect(setDefaultPatternsSchema.parse(term).end).toBe('2026-09-30')
  })
})

describe('copyShiftsSchema', () => {
  const copy = {
    tenantId: TENANT,
    fromStart: '2026-09-01',
    fromEnd: '2026-09-30',
    toStart: '2026-10-01',
    patternIds: [PATTERN],
  }

  it('コピー条件を通す', () => {
    expect(copyShiftsSchema.parse(copy).toStart).toBe('2026-10-01')
  })

  it('31 日ちょうどは通し、32 日は弾く', () => {
    expect(() =>
      copyShiftsSchema.parse({ ...copy, fromStart: '2026-09-01', fromEnd: '2026-10-01' })
    ).not.toThrow()

    const result = copyShiftsSchema.safeParse({
      ...copy,
      fromStart: '2026-09-01',
      fromEnd: '2026-10-02',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('コピー元の期間は最大31日間です')
  })

  it('コピー元が逆順なら弾く', () => {
    const result = copyShiftsSchema.safeParse({
      ...copy,
      fromStart: '2026-09-30',
      fromEnd: '2026-09-01',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('コピー元の終了日は開始日以降にしてください')
  })

  it('コピー先が過去でも通す（既存セルは上書きしないので安全）', () => {
    expect(() => copyShiftsSchema.parse({ ...copy, toStart: '2026-08-01' })).not.toThrow()
  })

  it('勤務パターンが 0 件なら日本語で弾く', () => {
    const result = copyShiftsSchema.safeParse({ ...copy, patternIds: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('コピー対象の勤務パターンを選択してください')
  })

  it('勤務パターンが配列でなくても日本語で弾く', () => {
    const result = copyShiftsSchema.safeParse({ ...copy, patternIds: undefined })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('コピー対象の勤務パターンを選択してください')
  })
})

describe('copyConditionsSchema', () => {
  it('前回条件を通す', () => {
    const parsed = copyConditionsSchema.parse({
      fromStart: '2026-09-01',
      fromEnd: '2026-09-30',
      toStart: '2026-10-01',
      patternIds: [PATTERN],
    })
    expect(parsed.patternIds).toEqual([PATTERN])
  })

  it('壊れた値は safeParse で落ちる（呼び出し側が既定値に戻す）', () => {
    expect(copyConditionsSchema.safeParse({ fromStart: 'zzz' }).success).toBe(false)
    expect(copyConditionsSchema.safeParse(null).success).toBe(false)
  })
})
