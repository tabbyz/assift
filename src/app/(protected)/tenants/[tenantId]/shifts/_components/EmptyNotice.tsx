'use client'

import Link from 'next/link'
import { Alert, Anchor, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

type Props = { tenantId: string; hasPattern: boolean; hasStaff: boolean }

/**
 * 勤務または在籍スタッフが 0 のときの 1 行の案内（014 §5.9）。
 *
 * 準備中の店舗は初期設定へ送るのでここには来ない。来るのは、完了済みで全員退職させた・勤務を全部消した店舗と、
 * v1 から移った「スタッフはいるが勤務 0」の店舗。005 の STEP カード（`SetupNotice`）の置き換え。
 */
export function EmptyNotice({ tenantId, hasPattern, hasStaff }: Props) {
  const [message, href, linkLabel] = !hasPattern
    ? ['勤務がありません。', `/tenants/${tenantId}/settings/patterns`, '勤務パターンを登録する']
    : [
        '在籍しているスタッフがいません。',
        `/tenants/${tenantId}/settings/staffs`,
        'スタッフを登録する',
      ]
  if (hasPattern && hasStaff) return null

  return (
    <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />} p="xs" mx={8} mb="sm">
      <Text size="sm">
        {message}
        <Anchor component={Link} href={href} size="sm" ml={4}>
          {linkLabel}
        </Anchor>
      </Text>
    </Alert>
  )
}
