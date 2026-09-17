/** ログイン後の既定の着地先 */
export const DEFAULT_AFTER_LOGIN = '/tenants'

/** 同一オリジン判定のためだけに使う基準。実際のホスト名は関係しない */
const SAFE_BASE = 'http://localhost'

/**
 * `?next=` の値を安全な相対パスに丸める（open redirect 対策）。
 *
 * 文字列の形だけで弾こうとすると漏れる。URL パーサはタブと改行を**取り除いてから**解釈するため、
 * `/<TAB>/evil.com` は「`//` で始まらない相対パス」に見えて `//evil.com` として解決される。
 * そこで実際に解決させ、同一オリジンに落ちたものだけを通す。
 */
export function safeNext(value: string | null | undefined, fallback = DEFAULT_AFTER_LOGIN): string {
  if (!value) return fallback
  // 自サイトのパスだけを受け付ける。`//host` はプロトコル相対 URL なので入口で落とす
  if (!value.startsWith('/') || value.startsWith('//')) return fallback

  let resolved: URL
  try {
    resolved = new URL(value, SAFE_BASE)
  } catch {
    return fallback
  }
  // `/\evil.com` やタブ入りなど、パーサがホスト名として解釈したものはここで落ちる
  if (resolved.origin !== SAFE_BASE) return fallback

  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}
