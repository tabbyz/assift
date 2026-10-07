import { describe, expect, it } from 'vitest'
import { v1Uuid } from '@/lib/migration/v1Ids'
import { rewriteLegacyTenantUrl } from './legacyUrl'

const NS = '7f4a1e62-0c1a-4f1e-9a3e-2b7c6d5e4f30'
const TOKEN = 'JuFZPcSXmXOaVvCmbb1JVw'
const ID = v1Uuid('tenants', TOKEN, NS)

const rewrite = (pathname: string, search = '') => rewriteLegacyTenantUrl(pathname, search, NS)

describe('rewriteLegacyTenantUrl', () => {
  it('店舗トップを uuid の URL にする', () => {
    expect(rewrite(`/tenants/${TOKEN}`)).toEqual({ pathname: `/tenants/${ID}`, search: '' })
  })

  it('配下のパスを保つ', () => {
    expect(rewrite(`/tenants/${TOKEN}/settings/general`)).toEqual({
      pathname: `/tenants/${ID}/settings/general`,
      search: '',
    })
  })

  it('start_date を start に読み替える', () => {
    expect(rewrite(`/tenants/${TOKEN}/shifts`, '?start_date=2026-10-01')).toEqual({
      pathname: `/tenants/${ID}`,
      search: '?start=2026-10-01',
    })
  })

  it('start_date 以外のクエリはそのまま残す', () => {
    expect(rewrite(`/tenants/${TOKEN}/shifts`, '?encoding=utf8&start_date=2026-10-01')).toEqual({
      pathname: `/tenants/${ID}`,
      search: '?encoding=utf8&start=2026-10-01',
    })
  })

  it('クエリが無ければ空のまま', () => {
    expect(rewrite(`/tenants/${TOKEN}/shifts`)?.search).toBe('')
  })

  it('start_date が無いクエリには触らない', () => {
    expect(rewrite(`/tenants/${TOKEN}/shifts`, '?view=week')?.search).toBe('?view=week')
  })

  it('PDF / CSV は Route Handler のパスにする', () => {
    expect(rewrite(`/tenants/${TOKEN}/shifts.pdf`, '?start_date=2026-10-01')).toEqual({
      pathname: `/api/tenants/${ID}/shifts/pdf`,
      search: '?start=2026-10-01',
    })
    expect(rewrite(`/tenants/${TOKEN}/shifts.csv`, '?encoding=utf8')).toEqual({
      pathname: `/api/tenants/${ID}/shifts/csv`,
      search: '?encoding=utf8',
    })
  })

  it('プロトタイプ上のキーをエクスポート種別として拾わない', () => {
    // 素の `EXPORT_PATHS[rest]` だと `constructor` が関数を返し、でたらめなパスへ飛ばされる
    for (const evil of ['constructor', 'toString', '__proto__', 'valueOf', 'hasOwnProperty']) {
      expect(rewrite(`/tenants/${TOKEN}/${evil}`)).toEqual({
        pathname: `/tenants/${ID}/${evil}`,
        search: '',
      })
    }
  })

  it('uuid の URL は書き換えない', () => {
    expect(rewrite(`/tenants/${ID}/shifts`)).toBeNull()
  })

  it('トークンでもない文字列は書き換えない（layout の 404 に任せる）', () => {
    expect(rewrite('/tenants/new')).toBeNull()
    expect(rewrite('/tenants')).toBeNull()
    expect(rewrite('/account')).toBeNull()
  })

  it('同じトークンからは常に同じ uuid になる', () => {
    expect(rewrite(`/tenants/${TOKEN}`)).toEqual(rewrite(`/tenants/${TOKEN}`))
  })
})
