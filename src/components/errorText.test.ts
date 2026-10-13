import { describe, expect, it } from 'vitest'
import { errorDigest } from './errorText'

describe('errorDigest', () => {
  it('Server の例外の digest を返す', () => {
    expect(errorDigest(Object.assign(new Error('x'), { digest: '1485408959' }))).toBe('1485408959')
  })

  it('digest が無い・文字列でないときは undefined', () => {
    expect(errorDigest(new Error('x'))).toBeUndefined()
    expect(errorDigest({ digest: 123 })).toBeUndefined()
  })

  it('Error でない値（throw null など）でも落ちない', () => {
    expect(errorDigest(null)).toBeUndefined()
    expect(errorDigest(undefined)).toBeUndefined()
    expect(errorDigest('boom')).toBeUndefined()
  })
})
