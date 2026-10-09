import { describe, expect, it } from 'vitest'
import { adminHostDecision, isAdminHost } from './host'

const prod = { adminHost: 'admin.assift.com', production: true }
const prodUnset = { adminHost: undefined, production: true }
const preview = { adminHost: undefined, production: false }
const dev = { adminHost: 'admin.localhost:3000', production: false }

describe('adminHostDecision', () => {
  it('管理画面のホストでは管理画面のパスを通し、それ以外は管理画面へ送る', () => {
    expect(adminHostDecision('admin.assift.com', '/-/users', prod)).toBe('pass')
    expect(adminHostDecision('admin.assift.com', '/-', prod)).toBe('pass')
    expect(adminHostDecision('admin.assift.com', '/', prod)).toBe('redirectToAdmin')
    expect(adminHostDecision('admin.assift.com', '/tenants', prod)).toBe('redirectToAdmin')
    expect(adminHostDecision('admin.assift.com', '/login', prod)).toBe('redirectToAdmin')
  })

  it('本体のホスト（本番の *.vercel.app を含む）では管理画面のパスを 404 にする', () => {
    expect(adminHostDecision('assift.com', '/-/users', prod)).toBe('notFound')
    expect(adminHostDecision('assift.com', '/-', prod)).toBe('notFound')
    expect(adminHostDecision('assift-abc.vercel.app', '/-/login', prod)).toBe('notFound')
    expect(adminHostDecision('assift.com', '/tenants', prod)).toBe('pass')
    expect(adminHostDecision(null, '/-/users', prod)).toBe('notFound')
  })

  it('/-foo は管理画面のパスではない', () => {
    expect(adminHostDecision('assift.com', '/-foo', prod)).toBe('pass')
    expect(adminHostDecision('admin.assift.com', '/-foo', prod)).toBe('redirectToAdmin')
  })

  it('ホスト名の大文字小文字は区別しない', () => {
    expect(adminHostDecision('Admin.Assift.com', '/-/users', prod)).toBe('pass')
  })

  it('ADMIN_HOST が無ければ、本番以外はどのホストでも管理画面を開く（プレビュー）', () => {
    expect(adminHostDecision('assift-git-x.vercel.app', '/-/users', preview)).toBe('pass')
    expect(adminHostDecision('assift-git-x.vercel.app', '/tenants', preview)).toBe('pass')
  })

  it('ADMIN_HOST が無い本番では管理画面を開かない（設定漏れで同じオリジンに開かない）', () => {
    expect(adminHostDecision('assift.com', '/-/users', prodUnset)).toBe('notFound')
    expect(adminHostDecision('assift.com', '/', prodUnset)).toBe('pass')
  })

  it('開発で ADMIN_HOST を入れると本番と同じ形になる（ポートまで比べる）', () => {
    expect(adminHostDecision('admin.localhost:3000', '/-/users', dev)).toBe('pass')
    expect(adminHostDecision('localhost:3000', '/-/users', dev)).toBe('notFound')
    expect(adminHostDecision('admin.localhost:3001', '/-/users', dev)).toBe('notFound')
  })
})

describe('isAdminHost', () => {
  it('ADMIN_HOST と一致するホストだけ', () => {
    expect(isAdminHost('admin.assift.com', prod)).toBe(true)
    expect(isAdminHost('assift.com', prod)).toBe(false)
    expect(isAdminHost(null, prod)).toBe(false)
  })

  it('ADMIN_HOST が無ければ本番以外は true、本番は false', () => {
    expect(isAdminHost('anything', preview)).toBe(true)
    expect(isAdminHost('assift.com', prodUnset)).toBe(false)
  })
})
