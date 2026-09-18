import { describe, expect, it } from 'vitest'
import { toActionError } from '@/lib/actions/error'
import { createPatternSchema, updatePatternSchema } from './patterns'

const TENANT = '22222222-2222-2222-2222-222222222222'
const PATTERN = '33333333-3333-3333-3333-000000000001'

const valid = {
  tenantId: TENANT,
  name: '早番',
  description: '7-15時',
  colorHex: '#FF5722',
  kind: 'workday',
  pairPatternId: null,
  defaultRequiredNums: { '0': 1, holiday: 2 },
}

const message = (input: unknown, schema = createPatternSchema) => {
  const r = schema.safeParse(input)
  return r.success ? null : toActionError(r.error)
}

describe('createPatternSchema', () => {
  it('正しい入力を通す', () => {
    expect(createPatternSchema.safeParse(valid).success).toBe(true)
  })

  it('seed の RFC 非準拠な uuid も通す（z.guid）', () => {
    expect(createPatternSchema.safeParse({ ...valid, tenantId: TENANT }).success).toBe(true)
  })

  it('名前の上限は 6 文字', () => {
    expect(message({ ...valid, name: 'あいうえおかき' })).toBe(
      '勤務パターン名は6文字以下で入力してください'
    )
  })

  it('空の名前を弾く', () => {
    expect(message({ ...valid, name: '  ' })).toBe('勤務パターン名を入力してください')
  })

  it('説明の上限は 10 文字', () => {
    expect(message({ ...valid, description: 'あ'.repeat(11) })).toBe(
      '説明は10文字以下で入力してください'
    )
  })

  it('hex 形式でないカラーを弾く', () => {
    expect(message({ ...valid, colorHex: 'red' })).toBe('カラーを選択してください')
    expect(message({ ...valid, colorHex: '#12345' })).toBe('カラーを選択してください')
    expect(message({ ...valid, colorHex: null })).toBe('カラーを選択してください')
  })

  it('パレット外でも hex 形式なら通す（v1 から移行した色を編集できるようにするため）', () => {
    expect(createPatternSchema.safeParse({ ...valid, colorHex: '#123456' }).success).toBe(true)
  })

  it('Select 未選択（null）の kind を日本語で弾く', () => {
    expect(message({ ...valid, kind: null })).toBe('パターン区分を選択してください')
  })

  it('必要人数の上限は 99', () => {
    expect(message({ ...valid, defaultRequiredNums: { '0': 100 } })).toBe(
      '必要人数は0〜99で入力してください'
    )
  })

  it('NumberInput の空欄（文字列）は英語を出さない', () => {
    expect(message({ ...valid, defaultRequiredNums: { '0': '' } })).toBe(
      '必要人数を入力してください'
    )
  })
})

describe('updatePatternSchema', () => {
  it('ペアに自分自身を選べない', () => {
    const r = updatePatternSchema.safeParse({
      ...valid,
      patternId: PATTERN,
      pairPatternId: PATTERN,
    })
    expect(r.success).toBe(false)
    expect(toActionError(r.error!)).toBe('ペア勤務パターンに自分自身は選べません')
  })

  it('他のパターンはペアにできる', () => {
    const r = updatePatternSchema.safeParse({
      ...valid,
      patternId: PATTERN,
      pairPatternId: '33333333-3333-3333-3333-000000000005',
    })
    expect(r.success).toBe(true)
  })
})
