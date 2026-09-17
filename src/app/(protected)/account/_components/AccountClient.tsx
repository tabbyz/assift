'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Container,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconInfoCircle } from '@tabler/icons-react'
import { logout } from '@/app/(protected)/actions'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { PASSWORD_MIN_LENGTH } from '@/lib/validation/auth'
import { deleteAccount, updateEmail, updatePassword } from '../actions'

type Props = {
  email: string
  /** メール変更の確認待ち（旧・新の両方が確認されるまで残る） */
  newEmail: string | null
  /** パスワードでログインできるか（Google だけのユーザーは false） */
  hasPassword: boolean
  /** /auth/callback から `?notice=` / `?error=` で渡された文言（page が検証済み） */
  notice?: string
  initialError?: string
}

export function AccountClient({ email, newEmail, hasPassword, notice, initialError }: Props) {
  const router = useRouter()
  const [nextEmail, setNextEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isEmailPending, startEmail] = useTransition()
  const [isPasswordPending, startPassword] = useTransition()
  const [isLogoutPending, startLogout] = useTransition()
  const [isDeletePending, startDelete] = useTransition()

  const submitEmail = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startEmail(async () => {
      const r = await updateEmail({ email: nextEmail })
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      setNextEmail('')
      notifications.show({
        message:
          '確認メールを送りました。現在と新しい両方のメールアドレスのリンクを開くと変更が完了します',
        color: 'green',
      })
    })
  }

  const submitPassword = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startPassword(async () => {
      const r = await updatePassword({ currentPassword, password, passwordConfirmation })
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      setCurrentPassword('')
      setPassword('')
      setPasswordConfirmation('')
      notifications.show({ message: 'パスワードを変更しました', color: 'green' })
    })
  }

  const doLogout = () =>
    startLogout(async () => {
      const r = await logout()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      router.push(r.data.redirectTo)
    })

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'アカウントを削除',
      children: <Text size="sm">本当にアカウントを削除しますか？この操作は取り消せません。</Text>,
      labels: { confirm: '削除する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startDelete(async () => {
          const r = await deleteAccount()
          if (!r.ok) {
            notifications.show({ message: r.error, color: 'red' })
            return
          }
          notifications.show({ message: 'アカウントを削除しました', color: 'green' })
          router.push(r.data.redirectTo)
        }),
    })

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>アカウント</Title>

        <FormErrorAlert message={initialError} />

        {notice && (
          <Alert color="teal" variant="light" icon={<IconInfoCircle size={16} />}>
            {notice}
            {newEmail && ' もう一方のメールアドレスに届いたリンクも開くと切り替わります。'}
          </Alert>
        )}

        <Paper withBorder p="lg">
          <Stack gap="md">
            <Title order={4}>メールアドレス</Title>
            <Text>{email}</Text>
            {newEmail && (
              <Text size="sm" c="dimmed">
                変更予定: {newEmail}（確認待ち）
              </Text>
            )}
            {hasPassword ? (
              <form onSubmit={submitEmail}>
                <Stack gap="sm">
                  <TextInput
                    label="新しいメールアドレス"
                    type="email"
                    autoComplete="email"
                    value={nextEmail}
                    onChange={(e) => setNextEmail(e.currentTarget.value)}
                    required
                  />
                  <Group justify="flex-end">
                    <Button type="submit" variant="default" loading={isEmailPending}>
                      確認メールを送信
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : (
              <Text size="sm" c="dimmed">
                Googleアカウントでログインしているため、メールアドレスは Google 側で管理されます。
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder p="lg">
          <Stack gap="md">
            <Title order={4}>パスワード</Title>
            {hasPassword ? (
              <form onSubmit={submitPassword}>
                <Stack gap="sm">
                  <PasswordInput
                    label="現在のパスワード"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.currentTarget.value)}
                    required
                  />
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
                  <Group justify="flex-end">
                    <Button type="submit" loading={isPasswordPending}>
                      パスワードを変更
                    </Button>
                  </Group>
                </Stack>
              </form>
            ) : (
              <Text size="sm" c="dimmed">
                Googleアカウント経由で登録されたためパスワードは変更できません。
              </Text>
            )}
          </Stack>
        </Paper>

        <Paper withBorder p="lg">
          <Group justify="space-between">
            <Title order={4}>ログアウト</Title>
            <Button variant="default" onClick={doLogout} loading={isLogoutPending}>
              ログアウト
            </Button>
          </Group>
        </Paper>

        <Paper withBorder p="lg">
          <Stack gap="md">
            <Title order={4}>アカウントを削除</Title>
            <Text size="sm" c="dimmed">
              アカウントを削除すると、作成した店舗・スタッフ・シフト表などすべてのデータが削除され、本サービスへログインできなくなります。
            </Text>
            <Text size="sm" c="red">
              この操作は元には戻せません。
            </Text>
            <Group>
              <Button
                color="red"
                variant="outline"
                onClick={confirmDelete}
                loading={isDeletePending}
              >
                アカウントを削除する
              </Button>
            </Group>
          </Stack>
        </Paper>
      </Stack>
    </Container>
  )
}
