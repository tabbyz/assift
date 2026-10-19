import type { Metadata } from 'next'
import { Container, Stack, Text, Title } from '@mantine/core'
import { readContactTenant } from '@/lib/contact/tenant'
import { parseDigest } from '@/lib/validation/contact'
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
      <Stack gap="xl">
        <Stack gap="xs">
          <Title order={1} fz={{ base: 22, xs: 34 }}>
            お問い合わせ
          </Title>
          <Text c="dimmed">
            assift についてのご質問・ご要望・不具合のご連絡を受け付けています。
          </Text>
        </Stack>
        <ContactForm
          account={user?.email ?? null}
          tenant={tenant ?? null}
          digest={parseDigest(digest) ?? null}
          initialTopic={topic}
        />
      </Stack>
    </Container>
  )
}
