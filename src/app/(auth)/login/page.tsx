import type { Metadata } from 'next'
import { Anchor, Text } from '@mantine/core'
import { LOGIN_ERRORS } from '@/lib/auth/notices'
import { safeNext } from '@/lib/auth/safeNext'
import { lookup } from '@/utils/record'
import { firstString } from '@/utils/searchParams'
import { AuthCard } from '../_components/AuthCard'
import { LoginForm } from './_components/LoginForm'

export const metadata: Metadata = { title: 'ログイン' }

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams
  const next = safeNext(firstString(params.next))
  return (
    <>
      <AuthCard>
        <LoginForm next={next} initialError={lookup(LOGIN_ERRORS, firstString(params.error))} />
      </AuthCard>
      {/* Google で初めてログインすると登録になり、/signup の同意チェックを通らない（016 第1条。民法 548 条の 2 の表示）。カードの外、ページの一番下 */}
      <Text mt="auto" ta="center" size="xs" c="dimmed">
        Googleアカウントで続行すると、
        <Anchor href="/terms" target="_blank" inherit>
          利用規約
        </Anchor>
        と
        <Anchor href="/privacy" target="_blank" inherit>
          プライバシーポリシー
        </Anchor>
        に同意したものとみなします。
      </Text>
    </>
  )
}
