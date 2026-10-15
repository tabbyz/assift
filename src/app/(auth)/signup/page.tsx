import type { Metadata } from 'next'
import { AuthCard } from '../_components/AuthCard'
import { SignupForm } from './_components/SignupForm'
import { loadSignupSearchParams } from './searchParams'

/**
 * `referrer`: `?email=` を参照元に載せない（新しいタブで開く同意のリンク・ロゴ・ログイン、アクセス解析の要求の `Referer`。025 §4.3）。
 * meta は挿入された時点でそのタブの方針を替え、外れても戻らない（全体の読み込みまで同一オリジンでもオリジンだけ）
 */
export const metadata: Metadata = { title: '新規登録', referrer: 'strict-origin' }

/** LP のメール入力から `?email=` でプリフィルされてくる（送信側は 011） */
export default async function SignupPage({ searchParams }: PageProps<'/signup'>) {
  const { email } = await loadSignupSearchParams(searchParams)
  return (
    <AuthCard>
      <SignupForm initialEmail={email ?? ''} />
    </AuthCard>
  )
}
