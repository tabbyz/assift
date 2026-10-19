import { describe, expect, it } from 'vitest'
import { TERMS } from '@/app/(public)/(site)/terms/_components/terms'
import { CONTACT_PATH, contactHref } from './path'

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
