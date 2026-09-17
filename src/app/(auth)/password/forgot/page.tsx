import type { Metadata } from 'next'
import { FORGOT_PASSWORD_ERRORS } from '@/lib/auth/notices'
import { lookup } from '@/utils/record'
import { firstString } from '@/utils/searchParams'
import { ForgotPasswordForm } from './_components/ForgotPasswordForm'

export const metadata: Metadata = { title: 'パスワード再設定' }

export default async function ForgotPasswordPage({ searchParams }: PageProps<'/password/forgot'>) {
  const params = await searchParams
  return (
    <ForgotPasswordForm initialError={lookup(FORGOT_PASSWORD_ERRORS, firstString(params.error))} />
  )
}
