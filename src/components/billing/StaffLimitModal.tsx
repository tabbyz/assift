'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { Anchor, Button, Group, Loader, Stack, Text } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import {
  type UpgradeOffer,
  getUpgradeOffer,
  setStaffCap,
  startTrial,
} from '@/app/(protected)/actions'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import { minStaffCap, suggestedStaffCap } from '@/lib/billing/staffCap'
import { formatJapaneseYearMonthDay } from '@/lib/calendar/dateString'
import { STAFF_CAP_MAX } from '@/lib/validation/billing'
import { PriceQuoteText } from './PriceIncreaseModal'
import { StaffCapField, staffCapError } from './StaffCapField'
import { CONTACT_EMAIL } from './contact'
import type { StaffAdditionRetry } from './staffAddition'

const MODAL_ID = 'staff-limit'

type Options = {
  /** 何人足そうとしたか（初期設定は名前の数、1 人ずつの追加・復帰は 1） */
  adding: number
  /** トライアルを始めた・上限を引き上げたあとに元の操作をやり直す（スタッフの追加・復帰・初期設定の完了） */
  retry: StaffAdditionRetry
}

/**
 * 在籍スタッフの上限で止まったときの案内（019 §5.3・§5.4・§13.4）。Action が `code: 'staff_limit'` を返したら開く。
 * 中身（トライアルを使えるか・上限・料金の見込み）は開いてから Action で読む（どの画面からでも同じ内容にするため）
 */
export function openStaffLimitModal(options: Options) {
  modals.open({
    modalId: MODAL_ID,
    title: '在籍スタッフの上限に達しました',
    children: <StaffLimitOffer {...options} />,
  })
}

const close = () => modals.close(MODAL_ID)

function StaffLimitOffer({ adding, retry }: Options) {
  const [offer, setOffer] = useState<UpgradeOffer | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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
      retry({})
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

  if (offer.kind === 'subscription') {
    return <RaiseCap offer={offer} adding={adding} limit={offer.limit} retry={retry} />
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
      <Text size="sm">無料プランは在籍 {FREE_STAFF_LIMIT} 人までです。</Text>
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

/**
 * 有料プランの上限人数で止まったとき（§13.4）。誤ってまとめて貼ったときに最初に出る画面なので、
 * 何を足そうとしているかを先に見せ、ボタンにも人数を入れる（1 クリックで誤りを通さない）。
 * 料金が上がるなら、その見込みも同じモーダルで出す（確認を 2 回続けない）
 */
function RaiseCap({
  offer,
  adding,
  limit,
  retry,
}: {
  offer: UpgradeOffer
  adding: number
  limit: number
  retry: StaffAdditionRetry
}) {
  const after = offer.activeStaffCount + adding
  const min = minStaffCap(after)
  const [cap, setCap] = useState<number | ''>(() => suggestedStaffCap(after))
  const [isPending, startTransition] = useTransition()
  const capError = staffCapError(cap, min)
  const tooMany = after > STAFF_CAP_MAX
  const quote = offer.priceQuote

  const submit = () =>
    startTransition(async () => {
      const r = await setStaffCap({ staffCap: cap })
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      notifications.show({ message: `上限を ${r.data.staffCap} 人にしました`, color: 'green' })
      close()
      retry({ acknowledgedPeak: after })
    })

  return (
    <Stack gap="md">
      <Text size="sm">
        有料プランの在籍スタッフの上限（{limit} 人）に達しました。
        <Text span fw={600} inherit>
          {adding} 人を追加しようとしています（在籍 {offer.activeStaffCount} 人 → {after} 人）。
        </Text>
      </Text>
      {tooMany ? (
        <Text size="sm" c="red">
          上限は {STAFF_CAP_MAX} 人までです。一度に追加する人数を減らしてください。
        </Text>
      ) : (
        <>
          <StaffCapField
            value={cap}
            onChange={setCap}
            min={min}
            discountPercent={offer.discountPercent}
            label="新しい上限"
            error={cap === '' ? null : capError}
          />
          {quote && <PriceQuoteText quote={quote} />}
        </>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>
          やめる
        </Button>
        {!tooMany && (
          <Button onClick={submit} loading={isPending} disabled={capError !== null}>
            上限を {cap === '' ? '-' : cap} 人にして {adding} 人を追加する
          </Button>
        )}
      </Group>
    </Stack>
  )
}
