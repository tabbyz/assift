import 'server-only'
import { headers } from 'next/headers'

/**
 * ローカル開発のホストか。dev サーバーは平文なので、`x-forwarded-proto` が無いときは `http` にする。
 *
 * `localhost` だけを見ていると、**`http://127.0.0.1:3000` で開いた dev サーバーが `https` 扱い**になり、
 * 組み立てた URL（OAuth の redirectTo・共有 URL）が開けなくなる。Supabase のローカル CLI が
 * 出すホストが `127.0.0.1` なので、そちらで開く場面は実際にある。
 */
export function isLoopbackHost(host: string): boolean {
  // `[::1]:3000` のような IPv6 も来るので、ポートは末尾の `:数字` として落とす
  const name = host.replace(/:\d+$/, '').toLowerCase()
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]'
}

/**
 * `SITE_URL` を正準オリジンに整える。使えない値なら `null`（呼び出し側はヘッダに戻る）。
 *
 * `new URL().origin` を通すので、末尾の `/` もパスも落ちて `https://host[:port]` の形になる。
 * **スキームの無い `assift.com` のような値を弾く**のが要点で、素通しすると共有 URL が
 * `assift.com/share/xxxx` になり、`new URL('/auth/callback', origin)` は例外になって Google ログインごと壊れる。
 */
export function normalizeSiteUrl(value: string | undefined): string | null {
  const raw = value?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

/**
 * アプリ自身のオリジンを得る（OAuth の redirectTo、共有 URL の組み立てに使う）。
 *
 * **`SITE_URL` があればそれを正準として使う。** 無ければリクエストのヘッダから組む
 * （`origin` → `x-forwarded-host` → `host`）。ヘッダはクライアントが名乗る値なので、
 * Host を固定しない構成では別のホスト名が入りうる。共有 URL（009）はオーナーがそのまま
 * 配るものなので、本番ではここを固定できるようにしておく。preview デプロイの一時 URL で
 * 共有 URL を作ってしまう事故も、同じ設定で防げる。
 *
 * Server Action だけでなく **page（GET）からも呼ぶ**（009 §5.3）。GET には `Origin` ヘッダが無いので
 * `x-forwarded-host` / `host` のフォールバックに落ちる。
 */
export async function requestOrigin(): Promise<string> {
  const configured = normalizeSiteUrl(process.env.SITE_URL)
  if (configured) return configured
  // 設定はされているのに使えない形だった場合は、黙って無視せず気付けるようにしておく
  if (process.env.SITE_URL?.trim()) {
    console.warn(`[requestOrigin] SITE_URL が URL として読めません: ${process.env.SITE_URL}`)
  }

  const h = await headers()
  const origin = h.get('origin')
  if (origin) return origin
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) throw new Error('リクエストのホストを判定できません')
  const proto = h.get('x-forwarded-proto') ?? (isLoopbackHost(host) ? 'http' : 'https')
  return `${proto}://${host}`
}
