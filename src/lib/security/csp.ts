/**
 * CSP（Content Security Policy。022）。proxy がリクエストごとに nonce を作り、方針の文字列をヘッダに載せる。
 *
 * - Next はレンダリング時に**リクエストヘッダ**の `content-security-policy` から `'nonce-…'` を抜き出し、
 *   自分のインラインスクリプトと chunk の `<script>` に付ける（`server/app-render/app-render.js`）
 * - Mantine の `<style>` には root layout が `headers()` で読んだ nonce を `getStyleNonce` で渡す（`AppProviders`）
 * - `style` 属性（Mantine の style props・`style={{…}}`）には nonce を付けられないので `style-src-attr 'unsafe-inline'`（022 §3）
 *
 * 方針を変えるときはテスト（`csp.test.ts`）と 022 §3 の表も直す。
 */

/** レスポンスとリクエストの両方に載せるヘッダ名 */
export const CSP_HEADER = 'Content-Security-Policy'
/** root layout が `headers()` で nonce を読むためのリクエストヘッダ */
export const NONCE_HEADER = 'x-nonce'

export type CspOptions = {
  /** `NODE_ENV === 'development'`。React の `eval`・dev overlay のインラインスタイル・HMR の WebSocket を許す */
  dev: boolean
}

/**
 * 16 バイトの乱数を base64 にした nonce。Next が拾う形式（`[A-Za-z0-9+/_-]+={0,2}`）に合う。
 * `Buffer` を使わず、proxy の実行環境（Node / Edge）に依らない
 */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

/**
 * 方針の文字列を組む。`;` 区切りの 1 行（Next の抜き出しは `;` で割って `script-src` を探す）。
 *
 * `style-src` のフォールバックに nonce を**書かない**: nonce があると `'unsafe-inline'` が無視されるので、
 * `-elem` / `-attr` を知らないブラウザで `style` 属性が全部止まる。知っているブラウザでは `-elem` / `-attr` が優先される
 */
export function buildCsp(nonce: string, { dev }: CspOptions): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    'style-src-elem': ["'self'", dev ? "'unsafe-inline'" : `'nonce-${nonce}'`],
    'style-src-attr': ["'unsafe-inline'"],
    // `@mantine/dates/styles.css` が `url("data:image/svg+xml…")` を使う
    'img-src': ["'self'", 'data:'],
    // LP の書体（`next/font/google`）はビルド時に取り込まれ、自オリジンから配られる
    'font-src': ["'self'"],
    // ブラウザから Supabase や Stripe を呼んでいない（Action 経由）。開発は Turbopack の HMR
    'connect-src': ["'self'", ...(dev ? ['ws:', 'wss:'] : [])],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  }
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ')
}
