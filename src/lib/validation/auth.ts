import { z } from 'zod'

/** v1 と同じ下限。supabase/config.toml の minimum_password_length と揃える */
export const PASSWORD_MIN_LENGTH = 8
/** bcrypt が扱える上限（GoTrue も 72 文字で弾く） */
export const PASSWORD_MAX_LENGTH = 72

export const emailSchema = z
  .email({ error: 'メールアドレスの形式が正しくありません' })
  .max(254, { error: 'メールアドレスが長すぎます' })

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, {
    error: `パスワードは${PASSWORD_MIN_LENGTH}文字以上で入力してください`,
  })
  .max(PASSWORD_MAX_LENGTH, {
    error: `パスワードは${PASSWORD_MAX_LENGTH}文字以下で入力してください`,
  })

/** 新しいパスワード + 確認入力。一致しないときは確認側にエラーを付ける */
const passwordPairFields = { password: newPasswordSchema, passwordConfirmation: z.string() }
const passwordsMatch = (v: { password: string; passwordConfirmation: string }) =>
  v.password === v.passwordConfirmation
const passwordsMatchError = {
  error: '確認用のパスワードが一致しません',
  path: ['passwordConfirmation'],
}

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { error: 'パスワードを入力してください' }),
  next: z.string().optional(),
})

export const signupSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
  agreed: z.literal(true, { error: '利用規約とプライバシーポリシーへの同意が必要です' }),
})

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resendConfirmationSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z
  .object(passwordPairFields)
  .refine(passwordsMatch, passwordsMatchError)

export const updateEmailSchema = z.object({ email: emailSchema })

export const updatePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, { error: '現在のパスワードを入力してください' }),
    ...passwordPairFields,
  })
  .refine(passwordsMatch, passwordsMatchError)

export const googleLoginSchema = z.object({ next: z.string().optional() })
