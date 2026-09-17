import { describe, expect, it } from 'vitest'
import {
  PASSWORD_MIN_LENGTH,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  updatePasswordSchema,
} from './auth'

const firstMessage = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
  r.success ? null : r.error?.issues[0]?.message

describe('loginSchema', () => {
  it('正しい入力を通す', () => {
    expect(loginSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(true)
  })

  it('メールアドレスの形式を検証する', () => {
    expect(firstMessage(loginSchema.safeParse({ email: 'not-mail', password: 'x' }))).toBe(
      'メールアドレスの形式が正しくありません'
    )
  })

  it('空のパスワードを弾く', () => {
    expect(firstMessage(loginSchema.safeParse({ email: 'a@example.com', password: '' }))).toBe(
      'パスワードを入力してください'
    )
  })
})

describe('signupSchema', () => {
  it('8 文字未満のパスワードを弾く', () => {
    const r = signupSchema.safeParse({ email: 'a@example.com', password: 'short', agreed: true })
    expect(firstMessage(r)).toBe(`パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください`)
  })

  it('規約未同意を弾く', () => {
    const r = signupSchema.safeParse({
      email: 'a@example.com',
      password: 'password',
      agreed: false,
    })
    expect(firstMessage(r)).toBe('利用規約とプライバシーポリシーへの同意が必要です')
  })
})

describe('resetPasswordSchema', () => {
  it('確認入力の不一致を弾く', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'password1',
      passwordConfirmation: 'password2',
    })
    expect(firstMessage(r)).toBe('確認用のパスワードが一致しません')
  })

  it('一致すれば通す', () => {
    const r = resetPasswordSchema.safeParse({
      password: 'password1',
      passwordConfirmation: 'password1',
    })
    expect(r.success).toBe(true)
  })
})

describe('updatePasswordSchema', () => {
  it('現在のパスワードを必須にする', () => {
    const r = updatePasswordSchema.safeParse({
      currentPassword: '',
      password: 'password1',
      passwordConfirmation: 'password1',
    })
    expect(firstMessage(r)).toBe('現在のパスワードを入力してください')
  })
})
