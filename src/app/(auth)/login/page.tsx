import type { Metadata } from 'next'
import { LOGIN_ERRORS } from '@/lib/auth/notices'
import { safeNext } from '@/lib/auth/safeNext'
import { lookup } from '@/utils/record'
import { firstString } from '@/utils/searchParams'
import { LoginForm } from './_components/LoginForm'

export const metadata: Metadata = { title: 'ログイン' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = safeNext(firstString(params.next))
  return <LoginForm next={next} initialError={lookup(LOGIN_ERRORS, firstString(params.error))} />
}
