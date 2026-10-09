'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Anchor, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { type UpgradeOffer, getUpgradeOffer, startTrial } from '@/app/(protected)/actions'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN } from '@/lib/billing/pricing'
import { formatJapaneseYearMonthDay } from '@/lib/calendar/dateString'
import { CONTACT_EMAIL } from './contact'

const MODAL_ID = 'staff-limit'

type Options = {
  /** トライアルを始めたあとに元の操作をやり直す（スタッフの追加・復帰・初期設定の完了） */
  onTrialStarted?: () => void
}

/**
 * 在籍スタッフの上限で止まったときの案内（019 §5.3・§5.4）。Action が `code: 'staff_limit'` を返したら開く。
 * 中身（トライアルを使えるか・上限）は開いてから Action で読む（どの画面からでも同じ内容にするため）
 */
export function openStaffLimitModal(options: Options = {}) {
  modals.open({
    modalId: MODAL_ID,
    title: '在籍スタッフの上限に達しました',
    children: <StaffLimitOffer onTrialStarted={options.onTrialStarted} />,
  })
}

const close = () => modals.close(MODAL_ID)

function StaffLimitOffer({ onTrialStarted }: Options) {
  const [offer, setOffer] = useState<UpgradeOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let active = true
    getUpgradeOffer().then((r) => {
      if (!active) return
      if (r.ok) setOffer(r.data)
      else setError(r.error)
    })
    return () => {
      active = false
    }
  }, [])

  const submitTrial = () =>
    startTransition(async () => {
      const r = await startTrial()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      notifications.show({
        message: `無料トライアルを始めました（${formatJapaneseYearMonthDay(r.data.trialLastDay)}まで）`,
        color: 'green',
      })
      close()
      onTrialStarted?.()
    })

  if (error) return <Text size="sm">{error}</Text>
  if (!offer) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    )
  }

  // 別のタブでトライアル・申し込みを済ませた後など。上限はもう無い
  if (offer.limit === null) {
    return (
      <Stack gap="md">
        <Text size="sm">
          現在のプランでは在籍スタッフの上限はありません。もう一度お試しください。
        </Text>
        <Group justify="flex-end">
          <Button onClick={close}>閉じる</Button>
        </Group>
      </Stack>
    )
  }

  if (offer.kind === 'manual') {
    return (
      <Stack gap="md">
        <Text size="sm">
          ご契約の上限（在籍 {offer.limit} 人）に達しています。人数を増やすには{' '}
          <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor>{' '}
          までお問い合わせください。
        </Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>
            閉じる
          </Button>
        </Group>
      </Stack>
    )
  }

  if (offer.trialAvailable) {
    return (
      <Stack gap="md">
        <Text size="sm">
          無料プランは在籍 {FREE_STAFF_LIMIT} 人までです。{FREE_STAFF_LIMIT}{' '}
          人を超えるスタッフは有料プランで使えます。
        </Text>
        <Text size="sm" fw={600}>
          {formatJapaneseYearMonthDay(offer.trialLastDay)}
          まで無料で、人数の制限なく試せます（カードの登録は要りません）。
        </Text>
        <Group justify="flex-end">
          <Button component={Link} href="/account/billing" variant="default" onClick={close}>
            料金を見る
          </Button>
          <Button onClick={submitTrial} loading={isPending}>
            無料で試す
          </Button>
        </Group>
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      <Text size="sm">
        無料プランは在籍 {FREE_STAFF_LIMIT} 人までです。有料プランに申し込むと{' '}
        {FREE_STAFF_LIMIT + 1} 人目から追加できます（{FREE_STAFF_LIMIT} 人を超えた 1 人あたり月{' '}
        {PRICE_PER_STAFF_YEN} 円）。
      </Text>
      {!offer.billingAvailable && (
        <Text size="sm" c="dimmed">
          現在お申し込みを受け付けていません。時間をおいてお試しください。
        </Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          閉じる
        </Button>
        {offer.billingAvailable && (
          <Button component={Link} href="/account/billing/subscribe" onClick={close}>
            有料プランに申し込む
          </Button>
        )}
      </Group>
    </Stack>
  )
}
