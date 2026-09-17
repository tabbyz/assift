'use client'

import { type FormEvent, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Button,
  Checkbox,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { MailSentPanel } from '@/components/MailSentPanel'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/auth'
import { resendConfirmation, signup } from '../actions'

type Props = { initialEmail: string }

export function SignupForm({ initialEmail }: Props) {
  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<string>()
  const [sent, setSent] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [isResending, startResend] = useTransition()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await signup({ email, password, agreed })
      if (!r.ok) {
        setError(r.error)
        return
      }
      setError(undefined)
      setSent(true)
    })
  }

  const resend = () =>
    startResend(async () => {
      const r = await resendConfirmation({ email })
      notifications.show({
        message: r.ok ? '確認メールを再送しました' : r.error,
        color: r.ok ? 'green' : 'red',
      })
    })

  if (sent) {
    return (
      <MailSentPanel
        title="確認メールを送りました"
        email={email}
        description="宛に確認メールを送りました。メール本文のリンクからユーザー登録を完了してください。"
        hint="メールが届かない場合は、迷惑メールフォルダを確認し、「assift.com」からのメールを受信できる設定にしたうえで再送してください。"
      >
        <Button variant="default" onClick={resend} loading={isResending}>
          確認メールを再送
        </Button>
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
        ユーザー登録
      </Title>

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
          <PasswordInput
            label={`パスワード（${PASSWORD_MIN_LENGTH}文字以上）`}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Checkbox
            checked={agreed}
            onChange={(e) => setAgreed(e.currentTarget.checked)}
            label={
              <>
                <Anchor href="/terms" target="_blank" size="sm">
                  利用規約
                </Anchor>
                と
                <Anchor href="/privacy" target="_blank" size="sm">
                  プライバシーポリシー
                </Anchor>
                に同意する
              </>
            }
          />
          <Button type="submit" loading={isPending} fullWidth>
            登録する（無料）
          </Button>
        </Stack>
      </form>

      <Text ta="center" size="sm" c="dimmed">
        すでにアカウントをお持ちの方は{' '}
        <Anchor component={Link} href="/login">
          ログイン
        </Anchor>
      </Text>
    </Stack>
  )
}
