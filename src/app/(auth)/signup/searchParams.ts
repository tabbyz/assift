import { createLoader, parseAsString } from 'nuqs/server'

/**
 * 新規登録の URL 状態。
 *
 * - `email`: 入力欄の初期値（`?email=` で開いたとき。004）。**読んだあと `SignupForm` が URL から消す**
 *   （参照元やアクセス解析にメールアドレスを残さない。025 §4.3）。URL に残す状態ではないが、
 *   `history.replaceState` を手で書かずに消すために nuqs に乗せる
 */
export const signupParsers = {
  email: parseAsString,
}

export const loadSignupSearchParams = createLoader(signupParsers)
