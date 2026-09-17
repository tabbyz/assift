import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { markRecoverySession } from '@/lib/auth/recoveryFlow'
import { safeNext } from '@/lib/auth/safeNext'
import { getAuthUser } from '@/utils/auth/current'
import { createClient } from '@/utils/supabase/server'

const EMAIL_OTP_TYPES = new Set<string>([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
])

/** 1 回目のメールアドレス変更確認の着地先（セッションが張られないので未ログインでも開ける公開ページ） */
const EMAIL_CHANGE_PENDING_PATH = '/auth/email-change'

/**
 * 失敗したときの戻り先。
 * `/login` はログイン済みだと proxy が `/tenants` へ飛ばしてクエリを捨てるため、
 * ログイン中のユーザーには `/account` を使う（そうしないとエラーが黙って消える）。
 */
function failurePath(type: string | null, isLoggedIn: boolean): string {
  if (type === 'recovery') return '/password/forgot?error=expired'
  return isLoggedIn ? '/account?error=link' : '/login?error=link'
}

/** GoTrue から error が返ってきたとき（Google の同意画面をキャンセルした等）の戻り先 */
function providerFailurePath(errorCode: string | null, isLoggedIn: boolean): string {
  const key = errorCode === 'access_denied' ? 'oauth_cancelled' : 'oauth'
  return isLoggedIn ? `/account?error=${key}` : `/login?error=${key}`
}

/**
 * 認証リンクの着地点（004 §3.1）。
 * - メール（確認 / 再設定 / 変更）: `token_hash` + `type` → verifyOtp。PKCE の verifier が要らないので別端末で開いても動く
 * - Google OAuth: `code` → exchangeCodeForSession（同一ブラウザで往復するので PKCE でよい）
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const to = (path: string) => NextResponse.redirect(new URL(path, request.nextUrl.origin))

  const next = safeNext(params.get('next'))
  const tokenHash = params.get('token_hash')
  const type = params.get('type')
  const code = params.get('code')
  const providerError = params.get('error')

  // GoTrue 側で失敗した場合は error / error_code / error_description が付いてくる
  if (providerError) {
    const errorCode = params.get('error_code') ?? providerError
    console.warn(`[auth/callback] provider error: ${errorCode}`)
    return to(providerFailurePath(errorCode, Boolean(await getAuthUser())))
  }

  const supabase = await createClient()

  if (tokenHash && type && EMAIL_OTP_TYPES.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    })
    if (error) {
      console.warn(`[auth/callback] verifyOtp(${type}) failed: ${error.code ?? error.message}`)
      return to(failurePath(type, Boolean(await getAuthUser())))
    }

    // メールアドレス変更は新旧 2 通の確認が要る。1 通目の検証はセッションを返さない（`{ msg, code }` だけ）。
    // 未ログインの端末で開かれていると保護ページには入れないので、公開ページで「もう 1 通」を案内する
    if (type === 'email_change' && !data.session) {
      return to(Boolean(await getAuthUser()) ? next : EMAIL_CHANGE_PENDING_PATH)
    }

    if (type === 'recovery') await markRecoverySession()
    return to(next)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.warn(`[auth/callback] exchangeCodeForSession failed: ${error.code ?? error.message}`)
      return to(providerFailurePath(null, Boolean(await getAuthUser())))
    }
    return to(next)
  }

  return to(failurePath(type, Boolean(await getAuthUser())))
}
