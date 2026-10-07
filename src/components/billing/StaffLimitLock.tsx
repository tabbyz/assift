'use client'

import type { ReactNode } from 'react'
import { Anchor, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { CONTACT_EMAIL } from './contact'
import classes from './StaffLimitLock.module.css'

type Props = {
  tenantId: string
  limit: number
  manual: boolean
  children: ReactNode
}

/**
 * 在籍が上限を超えているとき（トライアルの終了・解約・支払い失敗の後）、シフト表の上に重ねる（019 §5.4・§11-5）。
 * 画面だけのロックで、書き込みの Action は止めない（増やす操作は DB の門番が止める）。共有ページ・エクスポートも止めない
 */
export function StaffLimitLock({ tenantId, limit, manual, children }: Props) {
  return (
    <div className={classes.root}>
      <div inert className={classes.content}>
        {children}
      </div>
      <div className={classes.overlay}>
        <Paper withBorder shadow="md" p="lg" maw={480} w="100%">
          <Stack gap="md">
            <Title order={3} size="h4">
              ご利用中のプランの上限（在籍 {limit} 人）を超えています
            </Title>
            {manual ? (
              <Text size="sm">
                人数を増やすには <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>{' '}
                までお問い合わせいただくか、スタッフを退職にしてください。
              </Text>
            ) : (
              <Text size="sm">
                有料プランに申し込むか、在籍スタッフが {limit}{' '}
                人以下になるようスタッフを退職にしてください。
              </Text>
            )}
            <Group justify="flex-end">
              <LinkButton href={`/tenants/${tenantId}/settings/staffs`} variant="default">
                スタッフを見る
              </LinkButton>
              {!manual && (
                <LinkButton href="/account/billing/subscribe">有料プランに申し込む</LinkButton>
              )}
            </Group>
          </Stack>
        </Paper>
      </div>
    </div>
  )
}
