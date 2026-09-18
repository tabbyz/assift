import { describe, expect, it } from 'vitest'
import { parseRequiredNums } from './requiredNums'

describe('parseRequiredNums', () => {
  it('曜日キーと祝日キーを読む', () => {
    expect(parseRequiredNums({ '0': 1, '6': 2, holiday: 3 })).toEqual({
      '0': 1,
      '6': 2,
      holiday: 3,
    })
  })

  it('v1 由来の文字列を数値にする', () => {
    expect(parseRequiredNums({ '1': '4' })).toEqual({ '1': 4 })
  })

  it('未設定・空文字のキーは持たない', () => {
    expect(parseRequiredNums({ '0': null, '1': '', '2': undefined })).toEqual({})
  })

  it('範囲外・非整数・数値でない値は捨てる', () => {
    expect(parseRequiredNums({ '0': -1, '1': 100, '2': 1.5, '3': 'x', '4': true })).toEqual({})
  })

  it('知らないキーは無視する', () => {
    expect(parseRequiredNums({ '7': 1, foo: 2, '0': 3 })).toEqual({ '0': 3 })
  })

  it('オブジェクトでなければ空を返す', () => {
    expect(parseRequiredNums(null)).toEqual({})
    expect(parseRequiredNums('{}')).toEqual({})
    expect(parseRequiredNums([1, 2])).toEqual({})
  })

  it('0 は未設定と区別して保持する', () => {
    expect(parseRequiredNums({ '0': 0 })).toEqual({ '0': 0 })
  })
})
