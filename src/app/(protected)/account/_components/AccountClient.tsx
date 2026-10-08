'use client'

import { type FormEvent, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Anchor,
  Button,
  Container,
  Group,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconInfoCircle } from '@tabler/icons-react'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { SettingsSection } from '@/components/SettingsSection'
import { formatJapaneseYearMonthDay as formatDate } from '@/lib/calendar/dateString'
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
  deletion: {
    /** 有料プランを解約していない（先に解約してもらう） */
    blocked: boolean
    /** 解約済みで終了を待っている有料プランの最終日（YYYY-MM-DD）。無ければ null */
    planLastDay: string | null
  }
}

export function AccountClient({
  email,
  newEmail,
  hasPassword,
  notice,
  initialError,
  deletion,
}: Props) {
  const router = useRouter()
  const [nextEmail, setNextEmail] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [isEmailPending, startEmail] = useTransition()
  const [isPasswordPending, startPassword] = useTransition()
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

  const confirmDelete = () =>
    modals.openConfirmModal({
      title: 'アカウントを削除',
      children: (
        <Stack gap="xs">
          <Text size="sm">本当にアカウントを削除しますか？この操作は取り消せません。</Text>
          {deletion.planLastDay && (
            <Text size="sm" c="dimmed">
              解約済みの有料プランは{formatDate(deletion.planLastDay)}
              で終わり、今の請求期間の分（期間中に在籍スタッフが最も多かったときの人数）はそのあとに請求します。
            </Text>
          )}
        </Stack>
      ),
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
        <Title order={2}>アカウント情報</Title>

        <FormErrorAlert message={initialError} />

        {notice && (
          <Alert color="gray" variant="light" icon={<IconInfoCircle size={16} />}>
            {notice}
            {newEmail && ' もう一方のメールアドレスに届いたリンクも開くと切り替わります。'}
          </Alert>
        )}

        <SettingsSection
          title="メールアドレス"
          footer={
            hasPassword && (
              <Button type="submit" form="email-form" variant="default" loading={isEmailPending}>
                確認メールを送信
              </Button>
            )
          }
        >
          <Stack gap="md">
            <Text>{email}</Text>
            {newEmail && (
              <Text size="sm" c="dimmed">
                変更予定: {newEmail}（確認待ち）
              </Text>
            )}
            {hasPassword ? (
              // 送信ボタンは枠の下端（footer）にあるので form 属性で結ぶ
              <form id="email-form" onSubmit={submitEmail}>
                <TextInput
                  label="新しいメールアドレス"
                  type="email"
                  autoComplete="email"
                  value={nextEmail}
                  onChange={(e) => setNextEmail(e.currentTarget.value)}
                  required
                />
              </form>
            ) : (
              <Text size="sm" c="dimmed">
                Googleアカウントでログインしているため、メールアドレスは Google 側で管理されます。
              </Text>
            )}
          </Stack>
        </SettingsSection>

        <SettingsSection
          title="パスワード"
          footer={
            hasPassword && (
              <Button type="submit" form="password-form" loading={isPasswordPending}>
                パスワードを変更
              </Button>
            )
          }
        >
          <Stack gap="md">
            {hasPassword ? (
              <form id="password-form" onSubmit={submitPassword}>
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
                </Stack>
              </form>
            ) : (
              <Text size="sm" c="dimmed">
                Googleアカウント経由で登録されたためパスワードは変更できません。
              </Text>
            )}
          </Stack>
        </SettingsSection>

        <SettingsSection title="アカウントを削除">
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              アカウントを削除すると、作成した店舗・スタッフ・シフト表などすべてのデータが削除され、本サービスへログインできなくなります。
            </Text>
            <Text size="sm" c="red">
              この操作は元には戻せません。
            </Text>
            {deletion.blocked && (
              <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
                <Text size="sm">
                  有料プランをご利用中のため、アカウントを削除できません。先に
                  <Anchor component={Link} href="/account/billing" inherit>
                    プランとお支払い
                  </Anchor>
                  から有料プランを解約してください。
                </Text>
              </Alert>
            )}
            <Group>
              <Button
                color="red"
                variant="outline"
                onClick={confirmDelete}
                loading={isDeletePending}
                disabled={deletion.blocked}
              >
                アカウントを削除する
              </Button>
            </Group>
          </Stack>
        </SettingsSection>
      </Stack>
    </Container>
  )
}
