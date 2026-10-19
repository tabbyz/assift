'use client'

import { useTransition } from 'react'
import { Anchor, Button, Container, Group, Stack, Text, Title } from '@mantine/core'
import { ERROR_TEXT, errorDigest } from '@/components/errorText'
import { contactHref } from '@/lib/contact/path'

/** `error.tsx` / `global-error.tsx` の props（Next は型を生成しない。`error-boundary.d.ts` の `ErrorInfo` と同じ） */
export type ErrorPageProps = {
  /** 受けた例外。`Error` とは限らない（`throw null` も届く）。digest は `errorDigest()` で取り出す */
  error: unknown
  /** 境界の子をサーバーから取り直して描き直す（`reset()` は取り直さない） */
  retry: () => void
}

type Props = ErrorPageProps & {
  /** 「戻る」の行き先。店舗の境界は枠のナビがあるので渡さない */
  home?: { href: string; label: string }
  /**
   * 問い合わせ先。既定はお問い合わせのフォーム（エラー番号と店舗を引き継ぐ。031 §4.8）。
   * 管理画面はフォームを開けない（管理画面のホストでは `/-` の外が 404）のでアドレスにする
   */
  contact?: { kind: 'form'; tenantId?: string } | { kind: 'email' }
}

/**
 * `error.tsx` の本文（023）。見た目はルートの `not-found.tsx` に揃える。
 *
 * `error.message` は出さない: 本番の Server の例外は Next が汎用の英文に差し替え、Client の例外は技術的な英文で、どちらも利用者の役に立たない。
 * digest は Vercel のログの digest と一致するので、問い合わせから突き合わせられるように出す。
 *
 * **「戻る」は全体の読み込み（素の `<a>`）。** Next の境界はパスが変わったときにしか解けない（`error-boundary.js` の
 * `getDerivedStateFromProps`）。クライアント遷移で `/` へ行くと、redirect の先が落ちたページと同じパス（`/` → 直近の店舗）や
 * いまのパスそのもの（LP で落ちた）のときに、取り直しが成功しても境界が残り、押しても何も変わらない
 */
export function ErrorPanel({ error, retry, home, contact = { kind: 'form' } }: Props) {
  // `retry()` は `router.refresh()` を transition で走らせる。描き直しが終わるまでボタンに loading を出す（連打させない）
  const [isPending, startTransition] = useTransition()
  const digest = errorDigest(error)

  return (
    <Container size="sm" py="xl">
      <Stack gap="md" align="center">
        <Title order={2}>{ERROR_TEXT.title}</Title>
        <Text c="dimmed" ta="center">
          {ERROR_TEXT.description}
        </Text>
        <Group justify="center">
          <Button loading={isPending} onClick={() => startTransition(retry)}>
            {ERROR_TEXT.retry}
          </Button>
          {home && (
            <Button component="a" href={home.href} variant="default">
              {home.label}
            </Button>
          )}
        </Group>
        {contact.kind === 'form' ? (
          <Text size="sm" c="dimmed" ta="center">
            {ERROR_TEXT.contactFormPrefix}
            {/* 素の `<a>`（全体の読み込み）。「戻る」と同じく、クライアント遷移だと境界が残ることがある */}
            <Anchor href={contactHref({ tenantId: contact.tenantId, digest })} inherit>
              {ERROR_TEXT.contactFormLink}
            </Anchor>
            {ERROR_TEXT.contactFormSuffix(digest)}
          </Text>
        ) : (
          <Text size="sm" c="dimmed" ta="center">
            {ERROR_TEXT.contactPrefix}
            <Anchor href={`mailto:${ERROR_TEXT.contactEmail}`} inherit>
              {ERROR_TEXT.contactEmail}
            </Anchor>
            {ERROR_TEXT.contactSuffix(digest)}
          </Text>
        )}
        {digest && (
          <Text size="xs" c="dimmed" ff="monospace">
            {ERROR_TEXT.digest(digest)}
          </Text>
        )}
      </Stack>
    </Container>
  )
}
