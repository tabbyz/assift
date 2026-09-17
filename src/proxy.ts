import { NextResponse, type NextRequest } from 'next/server'
import {
  CURRENT_TENANT_COOKIE,
  CURRENT_TENANT_MAX_AGE,
  tenantIdFromPathname,
} from '@/lib/tenants/currentTenant'
import { resolveLegacyTenantUrl } from '@/lib/tenants/legacyUrl'
import { updateSession } from '@/utils/supabase/proxy'

// Next 16 では middleware.ts が proxy.ts に改名された。ロジックは lib / utils の純関数に置く
export async function proxy(request: NextRequest) {
  // 1. v1 の店舗 URL（22 文字トークン）なら新 URL へ 308。
  //    未ログインでも先に書き換えるので、/login?next= には新 URL が入る
  const legacy = legacyTenantRedirect(request)
  if (legacy) return legacy

  // 2. Supabase のセッション cookie 更新 + 保護ルートの未ログイン redirect
  const response = await updateSession(request)

  // 3. 開いている店舗を「直近の店舗」として覚える
  rememberCurrentTenant(request, response)

  return response
}

/** 旧 URL なら 308 の Response、そうでなければ null */
function legacyTenantRedirect(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const rewritten = resolveLegacyTenantUrl(pathname, search)
  if (!rewritten) return null

  // 文字列連結で Location を組まない（同一オリジンから外れないように clone を使う）
  const url = request.nextUrl.clone()
  url.pathname = rewritten.pathname
  url.search = rewritten.search
  return NextResponse.redirect(url, 308)
}

/**
 * `/tenants/<uuid>` 配下を開いたら cookie に記録する（005 §3.3）。
 *
 * proxy のコード内では prefetch を見分けられない（Next が RSC のヘッダを剥がす）ので、
 * 「開いていない店舗が直近になる」経路のほうを塞いでいる。他の店舗を指すリンクは
 * 店舗切替メニューだけなので、そこに `prefetch={false}` を付けている（TenantSwitcher）。
 * 現在の店舗を指すリンクは先読みされても同じ id なので、下の比較で書き込みが起きない。
 */
function rememberCurrentTenant(request: NextRequest, response: NextResponse) {
  // 未ログインで /login へ送り返す場合などは記録しない
  if (response.headers.has('location')) return

  const tenantId = tenantIdFromPathname(request.nextUrl.pathname)
  if (!tenantId || request.cookies.get(CURRENT_TENANT_COOKIE)?.value === tenantId) return

  response.cookies.set(CURRENT_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: CURRENT_TENANT_MAX_AGE,
  })
}

export const config = {
  matcher: [
    // 静的アセットと画像・フォントは対象外。
    // prefetch を除外してはいけない: セッション cookie を書けるのはここだけで、
    // 除外するとトークン更新（refresh token rotation）が prefetch のレンダリング中に起きて
    // 新しい token を保存できず、次の遷移でログアウトしてしまう
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff2?)$).*)',
  ],
}
