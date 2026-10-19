import { describe, expect, it } from 'vitest'
import { TERMS } from '@/app/(public)/(site)/terms/_components/terms'
import { CONTACT_PATH, contactHref, parseDigest } from './path'

describe('contactHref', () => {
  it('何も無ければ /contact', () => {
    expect(contactHref()).toBe(CONTACT_PATH)
    expect(contactHref({})).toBe('/contact')
  })

  it('種類・店舗・エラー番号をクエリに載せる', () => {
    expect(
      contactHref({
        topic: 'billing',
        tenantId: '22222222-2222-2222-2222-222222222222',
        digest: '1485408959',
      })
    ).toBe('/contact?topic=billing&tenant=22222222-2222-2222-2222-222222222222&digest=1485408959')
  })

  it('値をエスケープする', () => {
    expect(contactHref({ digest: 'a&b' })).toBe('/contact?digest=a%26b')
  })
})

describe('TERMS.contactUrl', () => {
  it('規約・ポリシーに書く URL は、お問い合わせのページを指す（PDF でも読めるよう文字で書いている）', () => {
    expect(TERMS.contactUrl).toBe(`https://assift.com${CONTACT_PATH}`)
  })
})

describe('parseDigest', () => {
  it('英数字・ハイフン・下線の 64 文字までを通す', () => {
    expect(parseDigest('abc_DEF-123')).toBe('abc_DEF-123')
    expect(parseDigest('a'.repeat(64))).toBe('a'.repeat(64))
  })

  it('それ以外・空・null は undefined', () => {
    expect(parseDigest('a'.repeat(65))).toBeUndefined()
    expect(parseDigest('a b')).toBeUndefined()
    expect(parseDigest('')).toBeUndefined()
    expect(parseDigest(null)).toBeUndefined()
  })
})
