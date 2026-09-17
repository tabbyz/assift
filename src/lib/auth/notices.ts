/**
 * URL のクエリ（`?error=` / `?notice=`）で画面に渡す文言。
 * 値ではなくキーを渡すのは、任意の文字列を画面に出せてしまうのを避けるため。
 * 参照は必ず `lookup()` 経由にする（プロトタイプ上のキーを拾わないため）。
 */

export const EXPIRED_LINK_MESSAGE =
  'リンクが無効か、有効期限が切れています。お手数ですがもう一度お手続きください'

/** パスワードを持たない（Google だけで登録した）アカウントに再設定を求められたとき */
export const GOOGLE_ONLY_MESSAGE =
  'このアカウントは Google ログインで登録されています。Google アカウントでログインしてください'

/** 同じ理由でアカウント画面の変更を断るとき */
export const GOOGLE_ONLY_ACCOUNT_MESSAGE =
  'Googleアカウントで登録されているため、メールアドレスとパスワードは変更できません'

/** /login で出すエラー */
export const LOGIN_ERRORS: Record<string, string> = {
  link: EXPIRED_LINK_MESSAGE,
  oauth: 'Google ログインに失敗しました。もう一度お試しください',
  oauth_cancelled: 'Google ログインを中断しました',
}

/** /password/forgot で出すエラー */
export const FORGOT_PASSWORD_ERRORS: Record<string, string> = {
  expired: EXPIRED_LINK_MESSAGE,
  google_only: GOOGLE_ONLY_MESSAGE,
}

/** /account で出すエラー */
export const ACCOUNT_ERRORS: Record<string, string> = {
  link: EXPIRED_LINK_MESSAGE,
  oauth: 'Google ログインに失敗しました。もう一度お試しください',
  oauth_cancelled: 'Google ログインを中断しました',
}

/** /account で出す通知 */
export const ACCOUNT_NOTICES: Record<string, string> = {
  email_change: 'メールアドレスの変更を確認しました。',
}
