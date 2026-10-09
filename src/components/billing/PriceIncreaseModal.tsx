'use client'

import { useEffect, useState } from 'react'
import { Button, Group, Loader, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { type UpgradeOffer, getUpgradeOffer } from '@/app/(protected)/actions'
import { formatJapaneseMonthDay } from '@/lib/calendar/dateString'
import type { StaffAdditionRetry } from './staffAddition'

const MODAL_ID = 'price-increase'

type Options = { adding: number; retry: StaffAdditionRetry }

/**
 * 料金が上がる追加の確認（019 §13.5）。Action が `code: 'price_increase'` を返したら開く。
 * 最大人数で請求するので、今の期間の最大人数を超えるときだけ出る。中身は開いてから Action で読む
 */
export function openPriceIncreaseModal(options: Options) {
  modals.open({
    modalId: MODAL_ID,
    title: 'この追加で料金が上がります',
    children: <PriceIncreaseOffer {...options} />,
  })
}

const close = () => modals.close(MODAL_ID)

function PriceIncreaseOffer({ adding, retry }: Options) {
  const [offer, setOffer] = useState<UpgradeOffer | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    getUpgradeOffer({ adding }).then((r) => {
      if (!active) return
      if (r.ok) setOffer(r.data)
      else setError(r.error)
    })
    return () => {
      active = false
    }
  }, [adding])

  if (error) return <Text size="sm">{error}</Text>
  if (!offer) {
    return (
      <Group justify="center" py="md">
        <Loader size="sm" />
      </Group>
    )
  }

  const after = offer.activeStaffCount + adding
  const confirm = () => {
    close()
    retry({ acknowledgedPeak: after })
  }
  const quote = offer.priceQuote

  return (
    <Stack gap="md">
      <Text size="sm">
        {adding} 人を追加します（在籍 {offer.activeStaffCount} 人 → {after} 人）。
      </Text>
      {quote ? (
        <PriceQuoteText quote={quote} />
      ) : (
        // 開くまでのあいだにほかの画面で減った・期間が切り替わったなど。料金は上がらない
        <Text size="sm">この追加で今の請求期間の料金は変わりません。</Text>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          やめる
        </Button>
        <Button onClick={confirm}>追加する</Button>
      </Group>
    </Stack>
  )
}

/** 料金の見込み（今 → 足したあと）。上限で止まったときのモーダルと共有する */
export function PriceQuoteText({ quote }: { quote: NonNullable<UpgradeOffer['priceQuote']> }) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={600}>
        この期間の見込み {quote.currentYen.toLocaleString()} 円 → {quote.nextYen.toLocaleString()}{' '}
        円
      </Text>
      <Text size="xs" c="dimmed">
        {formatJapaneseMonthDay(quote.periodLastDay)}
        までの請求期間。途中で人数を減らしても下がりません
      </Text>
    </Stack>
  )
}
