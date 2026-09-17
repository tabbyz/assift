import type { Metadata } from 'next'
import { Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconMailCheck } from '@tabler/icons-react'
import { LinkAnchor } from '@/components/LinkAnchor'

export const metadata: Metadata = { title: 'メールアドレス変更の確認' }

/**
 * メールアドレス変更の 1 通目を確認した直後のページ。
 * この時点ではセッションが張られないため（004 §7.3）、保護されていない場所に置く。
 * URL は /auth/email-change（(auth) はルートグループなのでパスには出ない）。
 */
export default function EmailChangePendingPage() {
  return (
    <Stack gap="md" align="center">
      <ThemeIcon size={72} radius="xl" variant="light">
        <IconMailCheck size={40} />
      </ThemeIcon>
      <Title order={2} ta="center">
        確認しました
      </Title>
      <Text ta="center">
        メールアドレスの変更には、変更前と変更後の両方のメールアドレスでの確認が必要です。
        もう一方に届いているメールのリンクも開いてください。
      </Text>
      <Text size="sm">
        <LinkAnchor href="/account">アカウント画面へ</LinkAnchor>
      </Text>
    </Stack>
  )
}
