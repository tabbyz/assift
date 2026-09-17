import type { Metadata } from 'next'
import { firstString } from '@/utils/searchParams'
import { SignupForm } from './_components/SignupForm'

export const metadata: Metadata = { title: '新規登録' }

/** LP のメール入力から `?email=` でプリフィルされてくる（送信側は 011） */
export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const params = await searchParams
  return <SignupForm initialEmail={firstString(params.email) ?? ''} />
}
