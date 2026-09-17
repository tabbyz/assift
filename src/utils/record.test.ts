import { describe, expect, it } from 'vitest'
import { lookup } from './record'

const MESSAGES = { link: 'リンクが無効です' }

describe('lookup', () => {
  it('自分が持つキーの値を返す', () => {
    expect(lookup(MESSAGES, 'link')).toBe('リンクが無効です')
  })

  it('未知のキーは undefined', () => {
    expect(lookup(MESSAGES, 'nope')).toBeUndefined()
    expect(lookup(MESSAGES, undefined)).toBeUndefined()
    expect(lookup(MESSAGES, null)).toBeUndefined()
    expect(lookup(MESSAGES, '')).toBeUndefined()
  })

  it('プロトタイプ上のキーは拾わない', () => {
    expect(lookup(MESSAGES, 'constructor')).toBeUndefined()
    expect(lookup(MESSAGES, '__proto__')).toBeUndefined()
    expect(lookup(MESSAGES, 'toString')).toBeUndefined()
    expect(lookup(MESSAGES, 'hasOwnProperty')).toBeUndefined()
  })
})
