import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import {
  AUTH_GENERIC_ERROR_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  WRONG_CURRENT_PASSWORD_MESSAGE,
  authErrorMessage,
  currentPasswordErrorMessage,
} from './authErrorMessage'

describe('authErrorMessage', () => {
  it('既知のコードを日本語にする', () => {
    const e = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    expect(authErrorMessage(e)).toBe(INVALID_CREDENTIALS_MESSAGE)
  })

  it('未知のコードは汎用メッセージ', () => {
    const e = new AuthApiError('something', 500, 'unexpected_failure')
    expect(authErrorMessage(e)).toBe(AUTH_GENERIC_ERROR_MESSAGE)
  })

  it('AuthError 以外は fallback', () => {
    expect(authErrorMessage(new Error('db down'))).toBe(AUTH_GENERIC_ERROR_MESSAGE)
    expect(authErrorMessage(null, 'x')).toBe('x')
  })
})

describe('currentPasswordErrorMessage', () => {
  it('資格情報の誤りだけを「パスワードが違う」にする', () => {
    const e = new AuthApiError('Invalid login credentials', 400, 'invalid_credentials')
    expect(currentPasswordErrorMessage(e)).toBe(WRONG_CURRENT_PASSWORD_MESSAGE)
  })

  it('レート制限はそのまま伝える', () => {
    const e = new AuthApiError('rate limited', 429, 'over_request_rate_limit')
    expect(currentPasswordErrorMessage(e)).toBe(
      'リクエストが多すぎます。しばらくしてからお試しください'
    )
  })

  it('通信エラーを「パスワードが違う」にしない', () => {
    expect(currentPasswordErrorMessage(new AuthRetryableFetchError('fetch failed', 0))).toBe(
      AUTH_GENERIC_ERROR_MESSAGE
    )
  })

  it('セッションが取れなかった場合も「パスワードが違う」にしない', () => {
    expect(currentPasswordErrorMessage(null)).toBe(AUTH_GENERIC_ERROR_MESSAGE)
  })
})
