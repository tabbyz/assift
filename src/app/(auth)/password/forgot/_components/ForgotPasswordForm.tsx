'use client'

import { type FormEvent, useState, useTransition } from 'react'
import Link from 'next/link'
import { Anchor, Button, Stack, Text, TextInput, Title } from '@mantine/core'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { MailSentPanel } from '@/components/MailSentPanel'
import { requestPasswordReset } from '../actions'

type Props = { initialError?: string }

export function ForgotPasswordForm({ initialError }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(initialError)
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await requestPasswordReset({ email })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(undefined)
      setSent(true)
    })
  }

  if (sent) {
    return (
      <MailSentPanel
        title="再設定メールを送りました"
        email={email}
        description="宛にパスワード再設定用のリンクを送りました。メールに記載のリンクから新しいパスワードを設定してください。"
        hint="メールが届かない場合は、迷惑メールフォルダと入力したメールアドレスを確認してください。"
      >
        <Text size="sm">
          <Anchor component={Link} href="/login">
            ログイン画面へ
          </Anchor>
        </Text>
      </MailSentPanel>
    )
  }

  return (
    <Stack gap="md">
      <Title order={2} ta="center">
        パスワード再設定
      </Title>
      <Text size="sm" c="dimmed">
        登録したメールアドレスを入力してください。パスワード再設定用のリンクをメールで送ります。
      </Text>

      <FormErrorAlert message={error} />

      <form onSubmit={submit}>
        <Stack gap="md">
          <TextInput
            label="メールアドレス"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={isPending} fullWidth>
            再設定メールを送信
          </Button>
        </Stack>
      </form>

      <Text ta="center" size="sm">
        <Anchor component={Link} href="/login">
          ログイン画面へ戻る
        </Anchor>
      </Text>
    </Stack>
  )
}
