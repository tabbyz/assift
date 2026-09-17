import 'server-only'
import { headers } from 'next/headers'

/**
 * Server Action からアプリ自身のオリジンを得る（OAuth の redirectTo に使う）。
 * Vercel などプロキシ配下では x-forwarded-* を優先する。
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers()
  const origin = h.get('origin')
  if (origin) return origin
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https')
  if (!host) throw new Error('リクエストのホストを判定できません')
  return `${proto}://${host}`
}
