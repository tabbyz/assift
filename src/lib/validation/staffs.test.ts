import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { createStaffSchema } from './staffs'

const TENANT = '22222222-2222-2222-2222-222222222222'
const PATTERN = '33333333-3333-3333-3333-000000000001'

const valid = {
  tenantId: TENANT,
  name: '山田 太郎',
  availableWdays: [0, 1, 2, 3, 4, 5, 6],
  maxWorkWeek: 5,
  availablePatternIds: [PATTERN],
  defaultPatterns: { '1': PATTERN },
}

const message = (input: unknown) => {
  const r = createStaffSchema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('createStaffSchema', () => {
  it('正しい入力を通す', () => {
    expect(createStaffSchema.safeParse(valid).success).toBe(true)
  })

  it('勤務曜日ゼロ・選択可能パターンゼロも許す（v1 と同じ）', () => {
    const r = createStaffSchema.safeParse({
      ...valid,
      availableWdays: [],
      availablePatternIds: [],
      defaultPatterns: {},
    })
    expect(r.success).toBe(true)
  })

  it('名前の上限は 10 文字', () => {
    expect(message({ ...valid, name: 'あ'.repeat(11) })).toBe(
      'スタッフ名は10文字以下で入力してください'
    )
  })

  it('週の最大勤務日数は 0..7', () => {
    expect(message({ ...valid, maxWorkWeek: 8 })).toBe('週の最大勤務日数は0〜7で入力してください')
  })

  it('NumberInput の空欄は日本語で弾く', () => {
    expect(message({ ...valid, maxWorkWeek: '' })).toBe('週の最大勤務日数を入力してください')
  })

  it('曜日の重複を弾く', () => {
    expect(message({ ...valid, availableWdays: [1, 1] })).toBe('勤務できる曜日が正しくありません')
  })

  it('範囲外の曜日を弾く', () => {
    expect(message({ ...valid, availableWdays: [7] })).toBe('勤務できる曜日が正しくありません')
  })

  it('選択可能パターンの重複を弾く', () => {
    expect(message({ ...valid, availablePatternIds: [PATTERN, PATTERN] })).toBe(
      '選択可能な勤務パターンが正しくありません'
    )
  })

  it('デフォルト勤務パターンの知らないキーを弾く', () => {
    expect(message({ ...valid, defaultPatterns: { '7': PATTERN } })).not.toBeNull()
  })
})
