import { describe, expect, it } from 'vitest'
import { buildCsp, generateNonce } from './csp'

const NONCE = 'AbC123+/=='

function directive(csp: string, name: string) {
  const found = csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `) || d === name)
  return found?.slice(name.length).trim().split(/\s+/) ?? null
}

describe('generateNonce', () => {
  it('Next が拾う形式（base64）で、毎回違う', () => {
    const a = generateNonce()
    const b = generateNonce()
    expect(a).toMatch(/^[A-Za-z0-9+/_-]+={0,2}$/)
    expect(a).not.toBe(b)
    expect(a.length).toBeGreaterThanOrEqual(22)
  })
})

describe('buildCsp（本番）', () => {
  const csp = buildCsp(NONCE, { dev: false })

  it('script-src は nonce + strict-dynamic。unsafe-inline / unsafe-eval は無い', () => {
    expect(directive(csp, 'script-src')).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"])
    expect(csp).not.toContain("'unsafe-eval'")
  })

  it('style-src-elem に nonce、style-src-attr は unsafe-inline（Mantine の style 属性）', () => {
    expect(directive(csp, 'style-src-elem')).toEqual(["'self'", `'nonce-${NONCE}'`])
    expect(directive(csp, 'style-src-attr')).toEqual(["'unsafe-inline'"])
  })

  it('フォールバックの style-src には nonce を書かない（書くと unsafe-inline が無視される）', () => {
    expect(directive(csp, 'style-src')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('外部のオリジンを許さない', () => {
    expect(csp).not.toMatch(/https?:\/\//)
    expect(directive(csp, 'connect-src')).toEqual(["'self'"])
    expect(directive(csp, 'font-src')).toEqual(["'self'"])
    expect(directive(csp, 'img-src')).toEqual(["'self'", 'data:'])
  })

  it('定石の directive', () => {
    expect(directive(csp, 'default-src')).toEqual(["'self'"])
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
    expect(directive(csp, 'base-uri')).toEqual(["'self'"])
    expect(directive(csp, 'form-action')).toEqual(["'self'"])
    expect(directive(csp, 'frame-ancestors')).toEqual(["'none'"])
  })

  it('1 行で、Next の抜き出し（; で割って script-src）が通る', () => {
    expect(csp).not.toContain('\n')
    expect(directive(csp, 'script-src')).toContain(`'nonce-${NONCE}'`)
  })
})

describe('buildCsp（開発）', () => {
  const csp = buildCsp(NONCE, { dev: true })

  it('script-src に unsafe-eval（React のエラー表示）。nonce は残す', () => {
    expect(directive(csp, 'script-src')).toContain("'unsafe-eval'")
    expect(directive(csp, 'script-src')).toContain(`'nonce-${NONCE}'`)
  })

  it('style-src-elem は nonce の代わりに unsafe-inline（dev overlay）', () => {
    expect(directive(csp, 'style-src-elem')).toEqual(["'self'", "'unsafe-inline'"])
  })

  it('connect-src に HMR の WebSocket', () => {
    expect(directive(csp, 'connect-src')).toEqual(["'self'", 'ws:', 'wss:'])
  })
})
