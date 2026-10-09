'use client'

import { type ReactNode, useTransition } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Button,
  Container,
  Group,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { LinkButton } from '@/components/LinkButton'
import { SettingsSection } from '@/components/SettingsSection'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { formatJapaneseYearMonthDay } from '@/lib/calendar/dateString'
import { startCheckout } from '../../actions'

type Props = {
  activeStaffCount: number
  /** トライアル中ならその最終日 */
  trialLastDay: string | null
  billingAvailable: boolean
}

/** 料金表に載せる人数 */
const EXAMPLE_COUNTS = [FREE_STAFF_LIMIT, 15, 20, 30, 50]

/**
 * お申し込み内容の確認（特商法 12 条の 6 の最終確認画面。018 §6）。
 * 料金・支払い時期・提供時期・契約期間・解約・返金を、利用規約「料金」・特商法の表記と同じ中身で書く
 */
export function SubscribeClient({ activeStaffCount, trialLastDay, billingAvailable }: Props) {
  const [isPending, startTransition] = useTransition()

  const submit = () =>
    startTransition(async () => {
      const r = await startCheckout()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      // Stripe の決済画面（外部）へ
      window.location.assign(r.data.redirectTo)
    })

  const rows: { label: string; value: ReactNode }[] = [
    {
      label: '料金',
      value: (
        <Stack gap={4}>
          <Text size="sm">
            在籍スタッフ {FREE_STAFF_LIMIT} 人までは無料、{FREE_STAFF_LIMIT + 1} 人目から 1
            人あたり月額 {PRICE_PER_STAFF_YEN} 円（税込）
          </Text>
          <Text size="sm" c="dimmed">
            人数は、毎月その月に全店舗の在籍スタッフ（退職済みにしていないスタッフ）が最も多かったときで数えます。
          </Text>
          <Text size="sm">
            いまの人数（{activeStaffCount} 人）なら月額{' '}
            {monthlyPriceYen(activeStaffCount).toLocaleString()} 円（税込）
          </Text>
        </Stack>
      ),
    },
    { label: '支払い方法', value: 'クレジットカード' },
    {
      label: '支払い時期',
      value: trialLastDay
        ? `毎月末に締め、翌月 1 日にご請求します。無料トライアルの終わる ${formatJapaneseYearMonthDay(trialLastDay)} までは請求しません`
        : '毎月末に締め、翌月 1 日にご請求します（お申し込みの月は、お申し込みから月末までの分）',
    },
    { label: '提供時期', value: 'お申し込み後、すぐにご利用いただけます' },
    { label: '契約期間', value: '1 か月ごと（自動更新）' },
    {
      label: '解約',
      value:
        'いつでも解約できます。解約した期間の終わりまで使え、その後は無料プランに戻ります。日割りの計算はしません',
    },
    { label: '返金', value: '法令で返金が定められている場合を除き、返金しません' },
  ]

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>お申し込み内容の確認</Title>

        <SettingsSection title="有料プラン">
          <Table variant="vertical" layout="fixed" withTableBorder={false}>
            <TableTbody>
              {rows.map((row) => (
                <TableTr key={row.label}>
                  <TableTh w={120}>{row.label}</TableTh>
                  <TableTd>
                    {typeof row.value === 'string' ? <Text size="sm">{row.value}</Text> : row.value}
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </SettingsSection>

        <SettingsSection title="料金の例">
          <Table withTableBorder={false}>
            <TableThead>
              <TableTr>
                <TableTh>その月の最大人数</TableTh>
                <TableTh ta="right">月額（税込）</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {EXAMPLE_COUNTS.map((count) => (
                <TableTr key={count}>
                  <TableTd>{count} 人</TableTd>
                  <TableTd ta="right">{monthlyPriceYen(count).toLocaleString()} 円</TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        </SettingsSection>

        <Text size="sm">
          お申し込みの前に{' '}
          <Anchor component={Link} href="/terms" target="_blank" inherit>
            利用規約
          </Anchor>
          と{' '}
          <Anchor component={Link} href="/law" target="_blank" inherit>
            特定商取引法に基づく表記
          </Anchor>
          をご確認ください。次の画面でカード情報を入力し、「申し込む」を押すとお申し込みが完了します。
        </Text>
        {!billingAvailable && (
          <Text size="sm" c="red">
            現在お申し込みを受け付けていません。時間をおいてお試しください。
          </Text>
        )}

        <Group justify="flex-end">
          <LinkButton href="/account/billing" variant="default">
            もどる
          </LinkButton>
          <Button onClick={submit} loading={isPending} disabled={!billingAvailable}>
            カード情報の入力へ
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
