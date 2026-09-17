import { describe, expect, it } from 'vitest'
import { isUuid } from './uuid'

describe('isUuid', () => {
  it('8-4-4-4-12 の hex を通す', () => {
    expect(isUuid('2ed6657d-e927-568b-95e1-2665a8aea6a2')).toBe(true)
    expect(isUuid('018F8B4E-2C1C-7C3A-9F0E-6B3F2A1C9D10')).toBe(true)
  })

  it('RFC の version / variant を満たさない id も通す（seed や pgTAP の id）', () => {
    // z.uuid() / uuid の validate() はこれらを弾く。Postgres は受けるのでアプリも受ける
    expect(isUuid('22222222-2222-2222-2222-222222222222')).toBe(true)
    expect(isUuid('aaaaaaaa-0000-0000-0000-00000000000a')).toBe(true)
  })

  it('形が違うものは落とす', () => {
    expect(isUuid('new')).toBe(false)
    expect(isUuid('2ed6657de927568b95e12665a8aea6a2')).toBe(false)
    expect(isUuid('2ed6657d-e927-568b-95e1-2665a8aea6a')).toBe(false)
    expect(isUuid('2ed6657d-e927-568b-95e1-2665a8aea6a2x')).toBe(false)
    expect(isUuid('zed6657d-e927-568b-95e1-2665a8aea6a2')).toBe(false)
    expect(isUuid('')).toBe(false)
    expect(isUuid(undefined)).toBe(false)
    expect(isUuid(null)).toBe(false)
  })
})
