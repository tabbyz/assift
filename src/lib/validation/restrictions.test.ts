import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { restrictionInputSchema, toRestrictionColumns } from './restrictions'

const P1 = '33333333-3333-3333-3333-000000000001'
const P2 = '33333333-3333-3333-3333-000000000003'

const message = (input: unknown) => {
  const r = restrictionInputSchema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('restrictionInputSchema', () => {
  it('deny_pattern_pair は両方のパターンが必須', () => {
    expect(
      restrictionInputSchema.safeParse({
        kind: 'deny_pattern_pair',
        pattern1Id: P1,
        pattern2Id: P2,
      }).success
    ).toBe(true)
    expect(message({ kind: 'deny_pattern_pair', pattern1Id: P1, pattern2Id: null })).toBe(
      '勤務パターンを選択してください'
    )
  })

  it('max_work_week は days 1..7', () => {
    expect(
      restrictionInputSchema.safeParse({ kind: 'max_work_week', pattern1Id: P1, days: 1 }).success
    ).toBe(true)
    expect(message({ kind: 'max_work_week', pattern1Id: P1, days: 8 })).toBe(
      '日数は1〜7で入力してください'
    )
  })

  it('max_work_consecutive はパターン未指定を許す', () => {
    expect(
      restrictionInputSchema.safeParse({ kind: 'max_work_consecutive', pattern1Id: null, days: 5 })
        .success
    ).toBe(true)
  })

  it('sat_or_sun_dayoff は追加入力なし', () => {
    expect(restrictionInputSchema.safeParse({ kind: 'sat_or_sun_dayoff' }).success).toBe(true)
  })

  it('知らない kind（v1 の残骸 max_work_month など）は日本語で弾く', () => {
    expect(message({ kind: 'max_work_month', pattern1Id: P1, days: 20 })).toBe(
      '制約タイプを選択してください'
    )
  })

  it('NumberInput の空欄は日本語で弾く', () => {
    expect(message({ kind: 'max_work_week', pattern1Id: P1, days: '' })).toBe(
      '日数を入力してください'
    )
  })
})

describe('toRestrictionColumns', () => {
  it('使わない列を null にする', () => {
    expect(
      toRestrictionColumns({ kind: 'deny_pattern_pair', pattern1Id: P1, pattern2Id: P2 })
    ).toEqual({ kind: 'deny_pattern_pair', days: null, pattern1_id: P1, pattern2_id: P2 })
    expect(toRestrictionColumns({ kind: 'max_work_week', pattern1Id: P1, days: 2 })).toEqual({
      kind: 'max_work_week',
      days: 2,
      pattern1_id: P1,
      pattern2_id: null,
    })
    expect(toRestrictionColumns({ kind: 'sat_or_sun_dayoff' })).toEqual({
      kind: 'sat_or_sun_dayoff',
      days: null,
      pattern1_id: null,
      pattern2_id: null,
    })
  })
})
