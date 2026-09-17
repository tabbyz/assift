'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, PasswordInput, Stack, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/auth'
import { resetPassword } from '../actions'

export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await resetPassword({ password, passwordConfirmation })
      if (!r.ok) {
        setError(r.error)
        return
      }
      notifications.show({ message: 'パスワードを再設定しました', color: 'green' })
      router.push(r.data.redirectTo)
    })
  }

  return (
    <Stack gap="md">
      <Title order={2} ta="center">
        新しいパスワードを設定
      </Title>

      <FormErrorAlert message={error} />

      <form onSubmit={submit}>
        <Stack gap="md">
          <PasswordInput
            label={`新しいパスワード（${PASSWORD_MIN_LENGTH}文字以上）`}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <PasswordInput
            label="新しいパスワード（確認）"
            autoComplete="new-password"
            value={passwordConfirmation}
            onChange={(e) => setPasswordConfirmation(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={isPending} fullWidth>
            パスワードを再設定
          </Button>
        </Stack>
      </form>
    </Stack>
  )
}
