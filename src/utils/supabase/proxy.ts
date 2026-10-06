import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import { getSupabasePublicEnv } from './env'

/** 未ログインでは開けないパス（前方一致） */
const PROTECTED_PREFIXES = ['/tenants', '/account', '/api/tenants']

/**
 * ログイン済みなら店舗へ送るパス（完全一致）。
 *
 * `/` は仮の LP（タイトル + ログインボタン）なので、ログイン済みの人に見せる意味が無く、
 * 「ログイン」ボタンを押しても `/login` から弾き返されるだけだった（005 §スコープ外の申し送り）。
 * **本物の LP を作るときはここから外し**、LP 側で CTA を出し分ける（未ログイン = ログイン / 新規登録、
 * ログイン済み = シフト表へ）。ログイン済みでも LP を読めるほうが自然なため
 */
const GUEST_ONLY_PATHS = ['/', '/login', '/signup']

function isProtectedPath(pathname: string) {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}

/**
 * Next の proxy（旧 middleware）から呼ぶ。
 * 1. Supabase のセッション cookie を更新する
 * 2. 保護パスの未ログインを /login へ、ゲスト専用パスのログイン済みを /tenants へ redirect する
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, key } = getSupabasePublicEnv()

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // getClaims は JWT をローカル検証する（getUser より速い）。ここで cookie も更新される
  const { data } = await supabase.auth.getClaims()
  const isLoggedIn = Boolean(data?.claims)
  const { pathname } = request.nextUrl

  if (!isLoggedIn && isProtectedPath(pathname)) {
    // クエリごと覚える（シフト表の ?start= など、無いと戻り先の表示が変わってしまう）
    const next = `${pathname}${request.nextUrl.search}`
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.search = ''
    loginUrl.searchParams.set('next', next)
    return NextResponse.redirect(loginUrl)
  }

  if (isLoggedIn && GUEST_ONLY_PATHS.includes(pathname)) {
    const tenantsUrl = request.nextUrl.clone()
    tenantsUrl.pathname = '/tenants'
    tenantsUrl.search = ''
    return NextResponse.redirect(tenantsUrl)
  }

  return response
}
