'use client'

import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import { unchangedHeadroomMessage } from '@/lib/billing/staffAddition'
import { openStaffCapModal } from './StaffCapModal'

type Props =
  | {
      kind: 'free' | 'manual'
      limit: number
      trialAvailable: boolean
    }
  | {
      /** 有料プラン（019 §13.4）。上限に達していなくても出す */
      kind: 'subscription'
      limit: number
      activeStaffCount: number
      /** 今の請求期間の最大人数。null = 見込みを出せない（トライアル中・切り替え待ち） */
      periodPeak: number | null
      discountPercent: number
    }

/**
 * スタッフの設定の上限の案内（v1 の `_upper_limit`。019 §5.4・§13.4）。追加ボタンは押せるまま。
 * 無料・個別契約は上限に達したときだけ、有料プランは常に「上限 N 人・在籍 M 人」を出す
 */
export function StaffLimitAlert(props: Props) {
  if (props.kind === 'subscription') return <SubscriptionCap {...props} />
  const { kind, limit, trialAvailable } = props
  return (
    <Alert color="blue" variant="light" bg="blue.0" icon={<IconInfoCircle size={16} />}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">
          {kind === 'manual'
            ? `ご契約の上限（在籍 ${limit} 人）に達しています。人数を増やすにはお問い合わせください。`
            : `無料プランの在籍スタッフは、全店舗の合計で ${limit} 人までです。${trialAvailable ? '無料トライアルを始めると、人数の制限なく試せます。' : ''}`}
        </Text>
        {kind === 'manual' ? (
          <LinkButton href="/account/billing" size="xs" variant="white" color="blue">
            プランを見る
          </LinkButton>
        ) : (
          <LinkButton href="/account/billing" size="xs" color="blue.7">
            プランをアップグレード
          </LinkButton>
        )}
      </Group>
    </Alert>
  )
}

function SubscriptionCap({
  limit,
  activeStaffCount,
  periodPeak,
  discountPercent,
}: Extract<Props, { kind: 'subscription' }>) {
  const atLimit = activeStaffCount >= limit
  const headroom =
    periodPeak === null ? null : unchangedHeadroomMessage(activeStaffCount, periodPeak)
  return (
    // 上限に達したら無料プランの帯と同じ淡い青（プランの案内。theme.ts）、達していなければ控えめな灰色
    <Alert
      color={atLimit ? 'blue' : 'gray'}
      variant="light"
      bg={atLimit ? 'blue.0' : undefined}
      icon={<IconInfoCircle size={16} />}
    >
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Stack gap={2}>
          <Text size="sm">
            {atLimit
              ? `有料プランの在籍スタッフの上限（全店舗の合計で ${limit} 人）に達しています。追加するには上限を引き上げてください。`
              : `有料プランの上限 ${limit} 人・在籍 ${activeStaffCount} 人（全店舗の合計）`}
          </Text>
          {headroom && (
            <Text size="xs" c="dimmed">
              {headroom}
            </Text>
          )}
        </Stack>
        <Button
          size="xs"
          variant={atLimit ? 'filled' : 'default'}
          color={atLimit ? 'blue.7' : undefined}
          onClick={() => openStaffCapModal({ current: limit, activeStaffCount, discountPercent })}
        >
          上限を変える
        </Button>
      </Group>
    </Alert>
  )
}
