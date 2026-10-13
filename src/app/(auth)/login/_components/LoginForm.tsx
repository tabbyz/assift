'use client'

import { type FormEvent, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Anchor,
  Button,
  Divider,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconBrandGoogle } from '@tabler/icons-react'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { login, loginWithGoogle } from '../actions'

type Props = { next: string; initialError?: string }

export function LoginForm({ next, initialError }: Props) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(initialError)
  const [isPending, startTransition] = useTransition()
  const [isGooglePending, startGoogleTransition] = useTransition()

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const r = await login({ email, password, next })
      if (!r.ok) {
        setError(r.error)
        return
      }
      router.push(r.data.redirectTo)
    })
  }

  const google = () =>
    startGoogleTransition(async () => {
      const r = await loginWithGoogle({ next })
      if (!r.ok) {
        setError(r.error)
        return
      }
      window.location.assign(r.data.url)
    })

  return (
    <Stack gap="md">
      <Title order={2} ta="center">
        ログイン
      </Title>

      <FormErrorAlert message={error} />

      <Button
        variant="default"
        leftSection={<IconBrandGoogle size={18} />}
        onClick={google}
        loading={isGooglePending}
        fullWidth
      >
        Googleアカウントでログイン
      </Button>

      <Divider label="または" labelPosition="center" />

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
            メールアドレスでログイン
          </Button>
        </Stack>
      </form>

      <Text ta="center" size="sm">
        <Anchor component={Link} href="/password/forgot">
          パスワードを忘れた方
        </Anchor>
      </Text>
      <Text ta="center" size="sm" c="dimmed">
        アカウントをお持ちでない方は{' '}
        <Anchor component={Link} href="/signup">
          新規登録
        </Anchor>
      </Text>
      {/* Google で初めてログインすると登録になり、/signup の同意チェックを通らない（016 第1条。民法 548 条の 2 の表示） */}
      <Text ta="center" size="xs" c="dimmed">
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
    </Stack>
  )
}
