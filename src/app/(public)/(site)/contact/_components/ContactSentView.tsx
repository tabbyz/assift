'use client'

import { Box, Button, Group, Stack, Text, ThemeIcon, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { contactReceiptNumber } from '@/lib/contact/render'
import classes from './ContactSentView.module.css'

type Props = {
  replyTo: string
  requestId: string
  /** ログイン中ならアプリへ、未ログインならトップへ戻す */
  loggedIn: boolean
  onAgain: () => void
}

/** 送信完了の画面（031 §10.8。デザインの A 案: 中央のチェックと要点） */
export function ContactSentView({ replyTo, requestId, loggedIn, onAgain }: Props) {
  return (
    <Stack align="center" ta="center" gap="lg" py="xl">
      <ThemeIcon className={classes.badge} color="green" variant="light" size={64} radius="xl">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            className={classes.check}
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </ThemeIcon>
      <Stack gap={6}>
        <Title order={2} fz={30} fw={900}>
          送信しました
        </Title>
        <Text c="dimmed">
          お問い合わせありがとうございます。
          <br />
          内容を確認のうえ、メールでご返信します。
        </Text>
      </Stack>
      <Box
        component="dl"
        w="100%"
        maw={520}
        m={0}
        px="lg"
        py="md"
        bg="gray.1"
        ta="left"
        fz={14.5}
        style={{
          borderRadius: 'var(--site-radius-md)',
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          columnGap: 'var(--mantine-spacing-lg)',
          rowGap: 'var(--mantine-spacing-xs)',
        }}
      >
        <Text component="dt" inherit c="dimmed">
          返信先
        </Text>
        <Text component="dd" inherit m={0} fw={700} style={{ overflowWrap: 'anywhere' }}>
          {replyTo}
        </Text>
        <Text component="dt" inherit c="dimmed">
          受付番号
        </Text>
        <Text
          component="dd"
          inherit
          m={0}
          fw={700}
          ff="monospace"
          style={{ letterSpacing: '0.04em' }}
        >
          #{contactReceiptNumber(requestId)}
        </Text>
      </Box>
      <Text size="sm" c="dimmed">
        数日たっても届かない場合は、迷惑メールのフォルダをご確認ください。
      </Text>
      <Group justify="center" gap="sm" mt="xs">
        <LinkButton href={loggedIn ? '/tenants' : '/'} size="md" radius="xl">
          {loggedIn ? 'アプリに戻る' : 'トップへ戻る'}
        </LinkButton>
        <Button variant="default" size="md" radius="xl" onClick={onAgain}>
          別のお問い合わせを送る
        </Button>
      </Group>
    </Stack>
  )
}
