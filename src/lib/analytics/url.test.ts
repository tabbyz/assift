import { describe, expect, it } from 'vitest'
import { stripQueryAndHash } from './url'

describe('stripQueryAndHash', () => {
  it('クエリとハッシュを落とす', () => {
    expect(stripQueryAndHash('https://assift.com/signup?email=a%40example.com#x')).toBe(
      'https://assift.com/signup'
    )
    expect(stripQueryAndHash('https://assift.com/login?next=%2Ftenants')).toBe(
      'https://assift.com/login'
    )
    expect(stripQueryAndHash('https://assift.com/terms#leave')).toBe('https://assift.com/terms')
  })

  it('path は残す（共有コード・uuid）', () => {
    const url = 'https://assift.com/tenants/22222222-2222-2222-2222-222222222222/settings/staffs'
    expect(stripQueryAndHash(`${url}?tab=retired`)).toBe(url)
    expect(stripQueryAndHash('https://assift.com/share/AbCd1234')).toBe(
      'https://assift.com/share/AbCd1234'
    )
  })

  it('クエリもハッシュも無ければそのまま', () => {
    expect(stripQueryAndHash('https://assift.com/')).toBe('https://assift.com/')
  })

  it('URL として解釈できなければ、最初の ? / # より前を返す', () => {
    expect(stripQueryAndHash('/signup?email=a@example.com')).toBe('/signup')
    expect(stripQueryAndHash('/terms#leave?x')).toBe('/terms')
    expect(stripQueryAndHash('')).toBe('')
  })
})
