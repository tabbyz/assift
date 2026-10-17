import { NextResponse, type NextRequest } from 'next/server'
import { adminHostDecision, adminHostEnv } from '@/lib/admin/host'
import { ADMIN_ROOT } from '@/lib/admin/paths'
import {
  CURRENT_TENANT_COOKIE,
  CURRENT_TENANT_MAX_AGE,
  tenantIdFromPathname,
} from '@/lib/tenants/currentTenant'
import { isPdfExportPath } from '@/lib/export/path'
import { CSP_HEADER, NONCE_HEADER, buildCsp, generateNonce } from '@/lib/security/csp'
import { rewriteLegacyTenantUrl } from '@/lib/tenants/legacyUrl'
import { updateSession } from '@/utils/supabase/proxy'

// Next 16 では middleware.ts が proxy.ts に改名された。ロジックは lib / utils の純関数に置く
export async function proxy(request: NextRequest) {
  // CSP の nonce（022）。リクエストヘッダに載せると Next がレンダリング時に拾い、自分の <script> に付ける
  const csp = attachCsp(request)

  // レスポンスの方針は、どの段が返した Response にも末尾で 1 回載せる（段ごとに付けると、段を足したときに付け忘れる）。
  // PDF の応答（`isPdfExportPath()`。完全一致）だけ付けない: Route Handler にしか届かず HTML を描かない経路で、
  // ブラウザのビューアへの影響を実機で確かめられないため（022 §3）。それ以外をパスで除外しない: proxy は応答の種類を見られず、
  // 存在しないパス（`/api/foo`・`/foo.png`）はどれも 404 の HTML（root の not-found）になり、除外した経路は CSP も nonce も無い HTML になる
  // （022 のレビューで 3 回見つけた穴）。段が `{ request }` を渡し忘れて描画側に nonce が届かないときは root layout の `assertNonce()` が名指しする
  const response = await route(request)
  if (!isPdfExportPath(request.nextUrl.pathname)) response.headers.set(CSP_HEADER, csp)
  return response
}

/** 段の合成。どれか 1 つの Response を返す */
async function route(request: NextRequest): Promise<NextResponse> {
  // 0. 運営者の管理画面のホストの振り分け（020 §4.2）。管理画面のホストでは管理画面だけを、
  //    本体のホストでは管理画面以外だけを開く
  const admin = adminHostResponse(request)
  if (admin) return admin

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

/**
 * nonce を作り、**リクエストヘッダ**に `x-nonce`（root layout が `headers()` で読む）と
 * `Content-Security-Policy`（Next が `'nonce-…'` を抜き出す）を書く。パスを問わず常に書き、`x-nonce` を上書きするので、
 * クライアントが送った値が layout に届くことは無い。レスポンス側に付ける規則は `proxy()`。
 *
 * `request.headers` を直接書き換える: `updateSession()` が `request.cookies.set()` で同じヘッダを書き換えて
 * `NextResponse.next({ request })` に渡しているので、複製して渡すと cookie の更新と二重管理になる
 */
function attachCsp(request: NextRequest): string {
  const nonce = generateNonce()
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === 'development' })
  request.headers.set(NONCE_HEADER, nonce)
  request.headers.set(CSP_HEADER, csp)
  return csp
}

/**
 * 管理画面のホストの振り分け。通すなら null。
 * 404 は存在しないパスへ rewrite して、アプリの not-found を 404 で出す（素の 404 の Response にしない。
 * rewrite 先は proxy を通らない）
 */
function adminHostResponse(request: NextRequest) {
  const decision = adminHostDecision(
    request.headers.get('host'),
    request.nextUrl.pathname,
    adminHostEnv()
  )
  if (decision === 'pass') return null

  const url = request.nextUrl.clone()
  url.search = ''
  if (decision === 'redirectToAdmin') {
    url.pathname = ADMIN_ROOT
    return NextResponse.redirect(url)
  }
  url.pathname = '/404'
  // `{ request }` で書き換えたリクエストヘッダ（CSP の nonce）を rewrite 先へ渡す（無いと元のヘッダで描かれ、nonce が無い）
  return NextResponse.rewrite(url, { request })
}

/** 旧 URL なら 308 の Response、そうでなければ null */
function legacyTenantRedirect(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const rewritten = rewriteLegacyTenantUrl(pathname, search)
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
    // 対象外は Next 自身が配るディレクトリ（`_next/static/`。配下は任意なので前方一致）と、
    // 実在する単一のパス（`_next/image`（クエリで指定。pathname は 1 つ）/ アイコン（favicon・icon.svg・apple-icon.png。027）/
    // OGP 画像と manifest（028。クローラーは cookie を持たない。管理画面のホストで外さないと 0 段目が `/-` へ redirect し、manifest が読めない）/
    // Stripe の Webhook / cron。後の 2 つはログイン状態と無関係で、署名 / CRON_SECRET でルート自身が守る。019 §5.9）だけ。
    // **単一のパスの除外は完全一致で書く**（`$`）。前方一致や拡張子で除外すると、存在しない URL（`/favicon.ico/x`・`/foo.png`）が
    // 404 の HTML（root の not-found）になるのに proxy を通らず、CSP の付かない HTML ができる（022 のレビューで見つけた。`public/` は無い）。
    // prefetch を除外してはいけない: セッション cookie を書けるのはここだけで、
    // 除外するとトークン更新（refresh token rotation）が prefetch のレンダリング中に起きて
    // 新しい token を保存できず、次の遷移でログアウトしてしまう。
    // Vercel Web Analytics のスクリプトと送信は Vercel が Next より手前で受けるので、ここは走らない（外す必要も無い。025 §3-7・§8）。
    '/((?!_next/static/|_next/image$|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$|opengraph-image\\.png$|manifest\\.webmanifest$|api/stripe/webhook$|api/cron/billing-usage$).*)',
  ],
}
