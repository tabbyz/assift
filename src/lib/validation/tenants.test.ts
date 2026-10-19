import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { INDUSTRIES } from '@/lib/setup/templates'
import { normalizeIndustry, updateTenantSchema } from './tenants'

const TENANT = '22222222-2222-2222-2222-222222222222'
const base = { tenantId: TENANT, name: 'さくら食堂', shiftCycle: 'month', startOfWeek: 0 }

const message = (input: unknown) => {
  const r = updateTenantSchema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('normalizeIndustry', () => {
  it('一言は「その他」のときだけ残し、空欄は null', () => {
    expect(normalizeIndustry({ industry: 'other', industryNote: ' ホテル ' })).toEqual({
      industry: 'other',
      industryNote: 'ホテル',
    })
    expect(normalizeIndustry({ industry: 'other', industryNote: '' })).toEqual({
      industry: 'other',
      industryNote: null,
    })
    expect(normalizeIndustry({ industry: 'food', industryNote: 'ホテル' })).toEqual({
      industry: 'food',
      industryNote: null,
    })
    expect(normalizeIndustry({ industry: null, industryNote: 'ホテル' })).toEqual({
      industry: null,
      industryNote: null,
    })
  })
})

describe('updateTenantSchema', () => {
  it('業種の省略（古いタブ）は undefined のまま通す（Action は業種に触らない）', () => {
    const parsed = updateTenantSchema.parse(base)
    expect(parsed.industry).toBeUndefined()
  })

  it.each([null, ...INDUSTRIES])('業種 %s を通す', (industry) => {
    expect(updateTenantSchema.parse({ ...base, industry }).industry).toBe(industry)
  })

  it('一覧に無い業種は日本語のエラー', () => {
    expect(message({ ...base, industry: 'medical' })).toBe('業種を選び直してください')
  })

  it('一言は前後の空白を落とし、空欄は null、21 文字は日本語のエラー', () => {
    expect(
      updateTenantSchema.parse({ ...base, industry: 'other', industryNote: ' 宿 ' }).industryNote
    ).toBe('宿')
    expect(
      updateTenantSchema.parse({ ...base, industry: 'other', industryNote: ' ' }).industryNote
    ).toBeNull()
    expect(message({ ...base, industry: 'other', industryNote: 'あ'.repeat(21) })).toBe(
      'お店の業種は20文字以内で入れてください'
    )
  })
})
