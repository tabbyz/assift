import { describe, expect, it } from 'vitest'
import { DEFAULT_AFTER_LOGIN, safeNext } from './safeNext'

const TAB = String.fromCharCode(9)
const LF = String.fromCharCode(10)
const CR = String.fromCharCode(13)

describe('safeNext', () => {
  it('相対パスはそのまま返す', () => {
    expect(safeNext('/tenants/abc/shifts?start=2026-09-01')).toBe(
      '/tenants/abc/shifts?start=2026-09-01'
    )
  })

  it('クエリとハッシュを保つ', () => {
    expect(safeNext('/tenants?a=1&b=2#top')).toBe('/tenants?a=1&b=2#top')
  })

  it('空や未指定は既定値', () => {
    expect(safeNext(undefined)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(null)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('')).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('絶対 URL やプロトコル相対 URL は既定値に落とす', () => {
    expect(safeNext('https://evil.com')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('//evil.com')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('/\\evil.com')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext('javascript:alert(1)')).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('URL パーサが取り除く文字でホスト名を作らせない', () => {
    // デコード後にこの形になる（?next=/%09/evil.com）。new URL はタブを捨てて //evil.com にする
    expect(safeNext(`/${TAB}/evil.com`)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(`/${LF}/evil.com`)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(`/${CR}/evil.com`)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(`/${TAB}${CR}${LF}/evil.com`)).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(`/${TAB}\\evil.com`)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('ユーザー情報を使ったホスト偽装も落とす', () => {
    expect(safeNext('//localhost@evil.com/')).toBe(DEFAULT_AFTER_LOGIN)
    expect(safeNext(`/${TAB}/localhost@evil.com/`)).toBe(DEFAULT_AFTER_LOGIN)
  })

  it('fallback を指定できる', () => {
    expect(safeNext(null, '/account')).toBe('/account')
  })
})
