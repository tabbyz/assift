import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import {
  createRestrictionSchema,
  resolveHard,
  restrictionInputSchema,
  toRestrictionColumns,
} from './restrictions'

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
    ).toEqual({
      kind: 'deny_pattern_pair',
      days: null,
      pattern1_id: P1,
      pattern2_id: P2,
      wdays: null,
    })
    expect(toRestrictionColumns({ kind: 'max_work_week', pattern1Id: P1, days: 2 })).toEqual({
      kind: 'max_work_week',
      days: 2,
      pattern1_id: P1,
      pattern2_id: null,
      wdays: null,
    })
    expect(toRestrictionColumns({ kind: 'sat_or_sun_dayoff' })).toEqual({
      kind: 'sat_or_sun_dayoff',
      days: null,
      pattern1_id: null,
      pattern2_id: null,
      wdays: null,
    })
  })

  it('新しい 3 種（013）', () => {
    expect(toRestrictionColumns({ kind: 'min_work_week', days: 3 })).toEqual({
      kind: 'min_work_week',
      days: 3,
      pattern1_id: null,
      pattern2_id: null,
      wdays: null,
    })
    expect(toRestrictionColumns({ kind: 'prefer_dayoff_wdays', wdays: [3] })).toEqual({
      kind: 'prefer_dayoff_wdays',
      days: null,
      pattern1_id: null,
      pattern2_id: null,
      wdays: [3],
    })
  })
})

describe('新しい 3 種（013）', () => {
  it('min_work_week は days 1..7、max_weekend_days は 1..15', () => {
    expect(restrictionInputSchema.safeParse({ kind: 'min_work_week', days: 3 }).success).toBe(true)
    expect(message({ kind: 'max_weekend_days', days: 0 })).toBe('日数は1〜15で入力してください')
    // 土日祝の上限は表示期間で数える（1 か月の土日祝は 9〜12 日）
    expect(restrictionInputSchema.safeParse({ kind: 'max_weekend_days', days: 9 }).success).toBe(
      true
    )
    expect(message({ kind: 'min_work_week', days: 8 })).toBe('日数は1〜7で入力してください')
    expect(message({ kind: 'min_work_week', days: '' })).toBe('日数を入力してください')
  })

  it('prefer_dayoff_wdays は 1〜6 個・重複なし。並べ直す', () => {
    const r = restrictionInputSchema.parse({ kind: 'prefer_dayoff_wdays', wdays: [5, 3] })
    expect(r).toEqual({ kind: 'prefer_dayoff_wdays', wdays: [3, 5] })
    expect(message({ kind: 'prefer_dayoff_wdays', wdays: [] })).toBe('曜日を選択してください')
    expect(message({ kind: 'prefer_dayoff_wdays', wdays: [3, 3] })).toBe('曜日を選択してください')
    expect(message({ kind: 'prefer_dayoff_wdays', wdays: [7] })).toBe('曜日を選択してください')
    expect(message({ kind: 'prefer_dayoff_wdays', wdays: [0, 1, 2, 3, 4, 5, 6] })).toBe(
      'すべての曜日は選べません'
    )
  })

  it('なるべく休みの曜日は必須にできない', () => {
    expect(resolveHard({ kind: 'prefer_dayoff_wdays' }, true)).toBe(false)
    expect(resolveHard({ kind: 'min_work_week' }, true)).toBe(true)
    expect(resolveHard({ kind: 'min_work_week' }, false)).toBe(false)
  })
})

describe('createRestrictionSchema', () => {
  const T = '22222222-2222-2222-2222-222222222222'
  const S = '44444444-4444-4444-4444-000000000003'
  const valid = {
    tenantId: T,
    staffId: S,
    hard: true,
    input: { kind: 'min_work_week', days: 3 },
  }

  it('対象は店舗全体（null）かスタッフ', () => {
    expect(createRestrictionSchema.safeParse(valid).success).toBe(true)
    expect(createRestrictionSchema.safeParse({ ...valid, staffId: null }).success).toBe(true)
    const r = createRestrictionSchema.safeParse({ ...valid, staffId: 'x' })
    expect(r.success ? null : toActionError(r.error)).toBe('スタッフを選択してください')
  })
})
