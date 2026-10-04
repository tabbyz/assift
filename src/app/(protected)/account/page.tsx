import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SimpleShell } from '@/components/SimpleShell'
import { ACCOUNT_ERRORS, ACCOUNT_NOTICES } from '@/lib/auth/notices'
import { getAuthUser } from '@/utils/auth/current'
import { lookup } from '@/utils/record'
import { firstString } from '@/utils/searchParams'
import { createClient } from '@/utils/supabase/server'
import { AccountClient } from './_components/AccountClient'
import { AccountUnavailable } from './_components/AccountUnavailable'

export const metadata: Metadata = { title: 'アカウント情報' }

export default async function AccountPage({ searchParams }: PageProps<'/account'>) {
  const params = await searchParams
  // 未ログインの判定は proxy / layout と同じ getAuthUser()（JWT の検証）に揃える。
  // ここだけ getUser()（ネットワーク）で弾くと、判定がずれたときに
  // /login へ送られ → proxy が /tenants へ戻す、でログアウトできなくなる
  const authUser = await getAuthUser()
  if (!authUser) redirect('/login')

  // new_email（メール変更の確認待ち）や providers は JWT の claims に無いので getUser() で取る
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  // セッションが他の端末で失効・削除されている場合はここだけが気づける。
  // 画面を出せないので、ログアウトだけできる状態にする
  if (error || !data.user) return <AccountUnavailable />

  const { user } = data
  const providers = (user.app_metadata.providers as string[] | undefined) ?? []
  return (
    <SimpleShell>
      <AccountClient
        email={user.email ?? ''}
        newEmail={user.new_email ?? null}
        hasPassword={providers.includes('email')}
        notice={lookup(ACCOUNT_NOTICES, firstString(params.notice))}
        initialError={lookup(ACCOUNT_ERRORS, firstString(params.error))}
      />
    </SimpleShell>
  )
}
