import { describe, expect, it } from 'vitest'
import { shouldLoadAnalytics } from './load'

describe('shouldLoadAnalytics', () => {
  const production = { adminHost: 'admin.assift.com', production: true }

  it('本番の本体のホストでは読み込む', () => {
    expect(shouldLoadAnalytics('assift.com', production)).toBe(true)
  })

  it('本番の管理画面のホストでは読み込まない（大文字・空白も同じホスト）', () => {
    expect(shouldLoadAnalytics('admin.assift.com', production)).toBe(false)
    expect(shouldLoadAnalytics(' Admin.Assift.com ', production)).toBe(false)
  })

  it('本番で ADMIN_HOST が無ければ、どのホストでも読み込む（管理画面は 404）', () => {
    const env = { adminHost: undefined, production: true }
    expect(shouldLoadAnalytics('assift.com', env)).toBe(true)
    expect(shouldLoadAnalytics(null, env)).toBe(true)
  })

  it('本番でなければ読み込まない（プレビュー・開発）', () => {
    expect(shouldLoadAnalytics('assift.com', { ...production, production: false })).toBe(false)
    expect(shouldLoadAnalytics('localhost:3000', { adminHost: undefined, production: false })).toBe(
      false
    )
  })
})
