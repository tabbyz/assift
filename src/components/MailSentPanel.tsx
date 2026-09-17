import type { ReactNode } from 'react'
import { Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { IconMailForward } from '@tabler/icons-react'

type Props = {
  title: string
  email: string
  description: string
  hint?: string
  children?: ReactNode
}

/** 「メールを送りました」の完了表示（登録の確認メール / パスワード再設定メール） */
export function MailSentPanel({ title, email, description, hint, children }: Props) {
  return (
    <Stack gap="md" align="center">
      <ThemeIcon size={72} radius="xl" variant="light">
        <IconMailForward size={40} />
      </ThemeIcon>
      <Title order={2} ta="center">
        {title}
      </Title>
      <Text ta="center">
        <Text span fw={600}>
          {email}
        </Text>{' '}
        {description}
      </Text>
      {hint && (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      )}
      {children}
    </Stack>
  )
}
