import { describe, expect, it } from 'vitest'
import {
  saveRequiredNumsSchema,
  setDefaultRequiredNumsSchema,
  setUniformDefaultRequiredNumsSchema,
} from './requiredNums'

const TENANT = '22222222-2222-2222-2222-222222222222'
const PATTERN = '33333333-3333-3333-3333-000000000001'

describe('saveRequiredNumsSchema', () => {
  it('パターン id → 人数 を通す', () => {
    const parsed = saveRequiredNumsSchema.parse({
      tenantId: TENANT,
      date: '2026-09-18',
      nums: { [PATTERN]: 3 },
    })
    expect(parsed.nums[PATTERN]).toBe(3)
  })

  it('空欄（NumberInput の空）はそのまま通す = この日の上書きを消す（015 §3.2）', () => {
    const parsed = saveRequiredNumsSchema.parse({
      tenantId: TENANT,
      date: '2026-09-18',
      nums: { [PATTERN]: '' },
    })
    expect(parsed.nums[PATTERN]).toBe('')
  })

  it('0 は 0 人として通す（空欄とは別）', () => {
    const parsed = saveRequiredNumsSchema.parse({
      tenantId: TENANT,
      date: '2026-09-18',
      nums: { [PATTERN]: 0 },
    })
    expect(parsed.nums[PATTERN]).toBe(0)
  })

  it('0 件でも通す（出勤日パターンが無い店舗）', () => {
    expect(
      saveRequiredNumsSchema.parse({ tenantId: TENANT, date: '2026-09-18', nums: {} }).nums
    ).toEqual({})
  })

  it('範囲外・小数は日本語で弾く', () => {
    for (const num of [-1, 100, 1.5]) {
      const result = saveRequiredNumsSchema.safeParse({
        tenantId: TENANT,
        date: '2026-09-18',
        nums: { [PATTERN]: num },
      })
      expect(result.success).toBe(false)
      expect(result.error?.issues[0]?.message).toMatch(/必要人数/)
    }
  })

  it('キーが uuid でなければ弾く', () => {
    const result = saveRequiredNumsSchema.safeParse({
      tenantId: TENANT,
      date: '2026-09-18',
      nums: { 'not-a-uuid': 1 },
    })
    expect(result.success).toBe(false)
  })
})

describe('setDefaultRequiredNumsSchema', () => {
  it('表示期間を通す', () => {
    expect(
      setDefaultRequiredNumsSchema.parse({
        tenantId: TENANT,
        start: '2026-09-01',
        end: '2026-09-30',
      }).end
    ).toBe('2026-09-30')
  })

  it('1 日でも通す', () => {
    expect(() =>
      setDefaultRequiredNumsSchema.parse({
        tenantId: TENANT,
        start: '2026-09-01',
        end: '2026-09-01',
      })
    ).not.toThrow()
  })

  it('31 日ちょうどは通し、32 日は弾く', () => {
    expect(() =>
      setDefaultRequiredNumsSchema.parse({
        tenantId: TENANT,
        start: '2026-10-01',
        end: '2026-10-31',
      })
    ).not.toThrow()
    const result = setDefaultRequiredNumsSchema.safeParse({
      tenantId: TENANT,
      start: '2026-10-01',
      end: '2026-11-01',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })

  it('end が start より前なら弾く', () => {
    const result = setDefaultRequiredNumsSchema.safeParse({
      tenantId: TENANT,
      start: '2026-09-30',
      end: '2026-09-01',
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('期間が正しくありません')
  })
})

describe('setUniformDefaultRequiredNumsSchema（014 §3.8）', () => {
  it('勤務 id → 人数 を通し、空欄は 0 にする', () => {
    expect(
      setUniformDefaultRequiredNumsSchema.parse({ tenantId: TENANT, nums: { [PATTERN]: '' } }).nums
    ).toEqual({ [PATTERN]: 0 })
  })

  it('勤務が 1 つも無ければ弾く', () => {
    const r = setUniformDefaultRequiredNumsSchema.safeParse({ tenantId: TENANT, nums: {} })
    expect(r.success).toBe(false)
  })

  it('範囲外は日本語で弾く', () => {
    const r = setUniformDefaultRequiredNumsSchema.safeParse({
      tenantId: TENANT,
      nums: { [PATTERN]: 100 },
    })
    expect(r.success ? null : r.error.issues[0].message).toBe('必要人数は0〜99で入力してください')
  })
})
