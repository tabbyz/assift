'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, PasswordInput, Stack, TextInput, Title } from '@mantine/core'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { adminLogin } from '../actions'

/** 管理画面のログイン。Google ログイン・新規登録・パスワードの再設定は置かない（020 §5） */
export function AdminLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await adminLogin({ email, password })
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.push(r.data.redirectTo)
    })
  }

  return (
    <Stack gap="md">
      <Title order={2} ta="center">
        assift 管理
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
            label="パスワード"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            required
          />
          <Button type="submit" loading={isPending} fullWidth>
            ログイン
          </Button>
        </Stack>
      </form>
    </Stack>
  )
}
