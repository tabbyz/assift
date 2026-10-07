import { describe, expect, it } from 'vitest'
import { SHARE_CODE_ALPHABET, isShareCode } from '@/lib/shares/code'
import { DEMO_SHARE_CODE } from './demoData'

/** v1 が `tr("0O1lIij", "2345678")` で置き換えていた文字。v1 から移したコードにも現れない */
const V1_REPLACED = '0O1lIij'

describe('DEMO_SHARE_CODE', () => {
  it('本物のコードと同じ形をしている', () => {
    expect(isShareCode(DEMO_SHARE_CODE)).toBe(true)
  })

  it('発行では作られない文字を含む（本物の共有と重ならない）', () => {
    const chars = [...DEMO_SHARE_CODE]
    expect(chars.some((c) => !SHARE_CODE_ALPHABET.includes(c))).toBe(true)
    expect(chars.some((c) => V1_REPLACED.includes(c))).toBe(true)
  })
})
