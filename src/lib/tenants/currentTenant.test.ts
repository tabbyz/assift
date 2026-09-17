import { describe, expect, it } from 'vitest'
import { pickTenantToOpen, tenantIdFromPathname } from './currentTenant'

const A = { id: '11111111-1111-1111-1111-111111111111' }
const B = { id: '22222222-2222-2222-2222-222222222222' }
const C = { id: '33333333-3333-3333-3333-333333333333' }

describe('tenantIdFromPathname', () => {
  it('店舗トップと配下から id を取る', () => {
    expect(tenantIdFromPathname(`/tenants/${A.id}`)).toBe(A.id)
    expect(tenantIdFromPathname(`/tenants/${A.id}/shifts`)).toBe(A.id)
    expect(tenantIdFromPathname(`/tenants/${A.id}/settings/general`)).toBe(A.id)
  })

  it('店舗 id でないパスは null', () => {
    expect(tenantIdFromPathname('/tenants')).toBeNull()
    expect(tenantIdFromPathname('/tenants/new')).toBeNull()
    expect(tenantIdFromPathname('/account')).toBeNull()
    // 旧 URL は先に 308 で書き換わるので、ここでは記録しない
    expect(tenantIdFromPathname('/tenants/JuFZPcSXmXOaVvCmbb1JVw/shifts')).toBeNull()
  })

  it('API のパスは対象外', () => {
    expect(tenantIdFromPathname(`/api/tenants/${A.id}/shifts/pdf`)).toBeNull()
  })

  it('大文字の uuid は小文字にそろえる（DB 由来の id と突き合わせるため）', () => {
    expect(tenantIdFromPathname(`/tenants/${A.id.toUpperCase()}/shifts`)).toBe(A.id)
  })
})

describe('pickTenantToOpen', () => {
  it('cookie の店舗が一覧にあればそれを開く', () => {
    expect(pickTenantToOpen([A, B, C], B.id)).toBe(B)
  })

  it('cookie が無ければ末尾（v1 の @tenants.last）', () => {
    expect(pickTenantToOpen([A, B, C], undefined)).toBe(C)
    expect(pickTenantToOpen([A, B, C], null)).toBe(C)
  })

  it('cookie の店舗が一覧に無ければ末尾に落とす（他人の店舗・削除済み）', () => {
    expect(pickTenantToOpen([A, B], C.id)).toBe(B)
  })

  it('uuid でない cookie 値は無視する', () => {
    expect(pickTenantToOpen([A, B], 'not-a-uuid')).toBe(B)
  })

  it('cookie が大文字でも一致させる', () => {
    expect(pickTenantToOpen([A, B, C], A.id.toUpperCase())).toBe(A)
  })

  it('店舗が無ければ null', () => {
    expect(pickTenantToOpen([], A.id)).toBeNull()
  })
})
