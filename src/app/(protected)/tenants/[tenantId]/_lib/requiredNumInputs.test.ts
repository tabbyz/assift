import { describe, expect, it } from 'vitest'
import { requiredNumInputValue, requiredNumPayload } from './requiredNumInputs'

const base = { patternId: 'e', required: 2 as number | null, overridden: false }

describe('requiredNumInputValue', () => {
  it('触った値が最優先', () => {
    expect(requiredNumInputValue(base, 5)).toBe(5)
    expect(requiredNumInputValue({ ...base, overridden: true }, '')).toBe('')
    expect(requiredNumInputValue(base, 0)).toBe(0)
  })

  it('触っていない勤務は、上書きがあるときだけ数が入る', () => {
    expect(requiredNumInputValue(base, undefined)).toBe('')
    expect(requiredNumInputValue({ ...base, overridden: true }, undefined)).toBe(2)
  })

  it('上書きの 0 も数として入る', () => {
    expect(requiredNumInputValue({ ...base, required: 0, overridden: true }, undefined)).toBe(0)
  })

  it('未設定（基本も無い）は空欄', () => {
    expect(requiredNumInputValue({ ...base, required: null }, undefined)).toBe('')
  })
})

describe('requiredNumPayload', () => {
  const rows = [
    { patternId: 'e', required: 2, overridden: false },
    { patternId: 'l', required: 4, overridden: true },
    { patternId: 'n', required: null, overridden: false },
  ]

  it('触っていない勤務は上書きのぶんだけ送る（残りは空欄 = 変えない）', () => {
    expect(requiredNumPayload(rows, {})).toEqual({ e: '', l: 4, n: '' })
  })

  it('触った勤務だけ値が変わる', () => {
    expect(requiredNumPayload(rows, { e: 3 })).toEqual({ e: 3, l: 4, n: '' })
  })

  it('「基本に戻す」で空欄にした勤務は空欄で送る', () => {
    expect(requiredNumPayload(rows, { l: '' })).toEqual({ e: '', l: '', n: '' })
  })

  it('rows に無い勤務は送らない（別タブで消された勤務を送り続けない）', () => {
    expect(requiredNumPayload(rows, { gone: 9 })).toEqual({ e: '', l: 4, n: '' })
  })
})
