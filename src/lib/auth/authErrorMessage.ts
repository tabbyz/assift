import { type AuthError, isAuthError } from '@supabase/supabase-js'
import { INVALID_INPUT_MESSAGE } from '@/lib/actions/error'

export const AUTH_GENERIC_ERROR_MESSAGE = '認証に失敗しました。時間をおいて再度お試しください'
export const INVALID_CREDENTIALS_MESSAGE = 'メールアドレスまたはパスワードが正しくありません'

/** GoTrue の AuthError.code → ユーザー向けの日本語 */
const MESSAGES: Record<string, string> = {
  invalid_credentials: INVALID_CREDENTIALS_MESSAGE,
  email_not_confirmed:
    'メールアドレスの確認が完了していません。届いている確認メールのリンクを開いてください',
  user_already_exists:
    'このメールアドレスは既に登録されています。ログイン画面からログインしてください',
  email_exists: 'このメールアドレスは既に登録されています', // メールアドレス変更時
  same_password: '現在と異なるパスワードを入力してください',
  weak_password: 'パスワードが簡単すぎます。別のパスワードを入力してください',
  validation_failed: INVALID_INPUT_MESSAGE,
  email_address_invalid: 'メールアドレスの形式が正しくありません',
  email_address_not_authorized: 'このメールアドレスには送信できません',
  over_email_send_rate_limit: 'メールの送信回数が上限に達しました。しばらくしてからお試しください',
  over_request_rate_limit: 'リクエストが多すぎます。しばらくしてからお試しください',
  otp_expired: 'リンクの有効期限が切れています。もう一度お手続きください',
  otp_disabled: 'この方法でのログインは無効になっています',
  provider_disabled: 'Google ログインは現在利用できません',
  oauth_provider_not_supported: 'Google ログインは現在利用できません',
  bad_oauth_state: 'Google ログインに失敗しました。もう一度お試しください',
  bad_oauth_callback: 'Google ログインに失敗しました。もう一度お試しください',
  bad_code_verifier: 'ログインの検証に失敗しました。同じブラウザでもう一度お試しください',
  flow_state_not_found: 'ログインの検証に失敗しました。もう一度お試しください',
  flow_state_expired: 'ログインの有効期限が切れました。もう一度お試しください',
  signup_disabled: '現在、新規登録を停止しています',
  user_banned: 'このアカウントは利用が停止されています',
  session_not_found: 'ログインの有効期限が切れました。もう一度ログインしてください',
  session_expired: 'ログインの有効期限が切れました。もう一度ログインしてください',
  reauthentication_needed: '再度ログインしてからお試しください',
  user_not_found: 'ユーザーが見つかりません',
}

/** Supabase Auth のエラーをユーザー向けメッセージに変換する。未知のコードは汎用メッセージ */
export function authErrorMessage(error: unknown, fallback = AUTH_GENERIC_ERROR_MESSAGE): string {
  if (!isAuthError(error)) return fallback
  const code = error.code
  if (code && MESSAGES[code]) return MESSAGES[code]
  return fallback
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = '現在のパスワードが正しくありません'

/**
 * パスワード変更時の「現在のパスワード」検証が失敗した理由を文言にする。
 * 資格情報の誤り以外（レート制限・通信エラー・サーバーエラー）まで「パスワードが違う」と
 * 言ってしまうと、正しく入力しているユーザーに嘘をつき、再入力を促して事態を悪化させる。
 */
export function currentPasswordErrorMessage(error: AuthError | null): string {
  if (!error) return AUTH_GENERIC_ERROR_MESSAGE
  if (error.code === 'invalid_credentials') return WRONG_CURRENT_PASSWORD_MESSAGE
  return authErrorMessage(error)
}
