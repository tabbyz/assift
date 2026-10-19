import type { Metadata } from 'next'
import { Container } from '@mantine/core'
import { readContactTenant } from '@/lib/contact/tenant'
import { parseDigest } from '@/lib/contact/path'
import { getAuthUser } from '@/utils/auth/current'
import { isUuid } from '@/utils/uuid'
import { ContactForm } from './_components/ContactForm'
import { loadContactSearchParams } from './searchParams'

export const metadata: Metadata = {
  title: 'お問い合わせ',
  description: 'assift へのご質問・ご要望・不具合のご連絡はこちらから。',
}

/**
 * お問い合わせ（031）。ログインの有無で中身を変える 1 ページ。
 * ログイン中はアカウントのアドレスに返し、店舗（RLS で見えるものだけ）とエラー番号を本文に添える（031 §4.4）
 */
export default async function ContactPage({ searchParams }: PageProps<'/contact'>) {
  const { topic, tenant: tenantParam, digest } = await loadContactSearchParams(searchParams)
  const user = await getAuthUser()
  const tenant = user && isUuid(tenantParam) ? await readContactTenant(tenantParam) : undefined

  return (
    <Container size={720} py="xl">
      {/* 見出しはフォームの側に置く（完了の画面では隠す）。
          URL の初期値が変わったら作り直す。描画のたびの値（乱数）にしない: Action が cookie を更新すると今のページが描き直され、
          送信の結果や入力が消える。同じ URL のまま次の問い合わせを送るのは、完了の画面のボタンで作り直す */}
      <ContactForm
        key={`${topic ?? ''}|${tenantParam ?? ''}|${digest ?? ''}`}
        loggedIn={Boolean(user)}
        account={user?.email ?? null}
        tenant={tenant ?? null}
        digest={parseDigest(digest) ?? null}
        initialTopic={topic}
      />
    </Container>
  )
}
