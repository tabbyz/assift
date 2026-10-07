'use client'

import { Alert, Group, Text } from '@mantine/core'
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { formatJapaneseYearMonthDay } from '@/lib/calendar/dateString'
import { PortalButton } from './PortalButton'

/** 残りがこの日数以下になったらトライアルの帯の色を変える（019 §5.4） */
const TRIAL_WARNING_DAYS = 7

export type PlanBannerProps =
  { kind: 'trial'; lastDay: string; daysLeft: number } | { kind: 'past_due'; legacy: boolean }

/**
 * 店舗の画面の上に出す帯（019 §5.4）。トライアル中は残り日数、支払い失敗（past_due）はカードの更新を促す
 * （Stripe の支払い失敗のメールと二重に知らせる）
 */
export function PlanBanner(props: PlanBannerProps) {
  if (props.kind === 'past_due') {
    return (
      <Alert color="red" variant="light" radius={0} py="xs" icon={<IconAlertTriangle size={16} />}>
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text size="sm">
            お支払いができませんでした。カードを更新してください。更新がないまま再試行が尽きると有料プランが終了します。
            {props.legacy && '終了すると旧料金には戻れません。'}
          </Text>
          <PortalButton label="カードを更新" size="xs" color="red" />
        </Group>
      </Alert>
    )
  }

  const warning = props.daysLeft <= TRIAL_WARNING_DAYS
  const remaining = props.daysLeft === 0 ? '今日まで' : `あと ${props.daysLeft} 日`
  return (
    <Alert
      color={warning ? 'orange' : 'blue'}
      variant="light"
      radius={0}
      py="xs"
      icon={<IconInfoCircle size={16} />}
    >
      <Group justify="space-between" wrap="wrap" gap="xs">
        <Text size="sm">
          無料トライアル中: {remaining}（{formatJapaneseYearMonthDay(props.lastDay)}
          まで）。続けて使うには有料プランへお申し込みください。
        </Text>
        <LinkButton
          href="/account/billing"
          size="xs"
          variant={warning ? 'filled' : 'light'}
          color={warning ? 'orange' : 'blue'}
        >
          プランを見る
        </LinkButton>
      </Group>
    </Alert>
  )
}
