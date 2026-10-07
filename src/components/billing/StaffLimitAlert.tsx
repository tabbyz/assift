'use client'

import { Alert, Group, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'

type Props = {
  limit: number
  /** 個別契約なら申し込みではなく問い合わせを案内する */
  manual: boolean
  trialAvailable: boolean
}

/** スタッフの設定で、在籍が上限に達したときの案内（v1 の `_upper_limit`。019 §5.4）。追加ボタンは押せるまま */
export function StaffLimitAlert({ limit, manual, trialAvailable }: Props) {
  return (
    <Alert color="yellow" variant="light" icon={<IconInfoCircle size={16} />}>
      <Group justify="space-between" wrap="wrap" gap="sm">
        <Text size="sm">
          {manual
            ? `ご契約の上限（在籍 ${limit} 人）に達しています。人数を増やすにはお問い合わせください。`
            : `無料プランは在籍 ${limit} 人までです。${trialAvailable ? '無料トライアルを始めると、人数の制限なく試せます。' : '有料プランに申し込むと、人数の制限なく使えます。'}`}
        </Text>
        <LinkButton href="/account/billing" size="xs" variant="white" color="yellow">
          プランを見る
        </LinkButton>
      </Group>
    </Alert>
  )
}
