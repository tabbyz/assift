import { describe, expect, it } from 'vitest'
import { isLoopbackHost, normalizeSiteUrl } from './requestOrigin'

describe('isLoopbackHost', () => {
  it('ローカル開発のホストを認める（ポートの有無を問わない）', () => {
    expect(isLoopbackHost('localhost:3000')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    // Supabase のローカル CLI が出すホスト。ここを落とすと共有 URL が https になって開けない
    expect(isLoopbackHost('127.0.0.1:3000')).toBe(true)
    expect(isLoopbackHost('[::1]:3000')).toBe(true)
  })

  it('本番のホストは認めない', () => {
    expect(isLoopbackHost('assift.com')).toBe(false)
    expect(isLoopbackHost('assift.vercel.app')).toBe(false)
    // ホスト名に localhost を含むだけのドメインを通さない
    expect(isLoopbackHost('localhost.example.com')).toBe(false)
    expect(isLoopbackHost('notlocalhost')).toBe(false)
  })
})

describe('normalizeSiteUrl', () => {
  it('絶対 URL を origin に正規化する（末尾の / とパスは落ちる）', () => {
    expect(normalizeSiteUrl('https://assift.com')).toBe('https://assift.com')
    expect(normalizeSiteUrl('https://assift.com/')).toBe('https://assift.com')
    expect(normalizeSiteUrl('  https://assift.com/app  ')).toBe('https://assift.com')
    expect(normalizeSiteUrl('http://192.168.1.5:3000')).toBe('http://192.168.1.5:3000')
  })

  it('未設定なら null（ヘッダから組む）', () => {
    expect(normalizeSiteUrl(undefined)).toBeNull()
    expect(normalizeSiteUrl('')).toBeNull()
    expect(normalizeSiteUrl('   ')).toBeNull()
  })

  // スキームが無い値を素通しすると、共有 URL が壊れたうえ OAuth の redirectTo が例外になる
  it('URL として読めない値・http(s) でない値は null', () => {
    expect(normalizeSiteUrl('assift.com')).toBeNull()
    expect(normalizeSiteUrl('assift.com/share')).toBeNull()
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeSiteUrl('ftp://assift.com')).toBeNull()
  })
})
