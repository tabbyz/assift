'use client'

import { type ReactNode, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Anchor,
  Box,
  Button,
  Container,
  Divider,
  Flex,
  Group,
  Paper,
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
import { StaffCapField, staffCapError } from '@/components/billing/StaffCapField'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { minStaffCap, suggestedStaffCap } from '@/lib/billing/staffCap'
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
 * 料金・支払い時期・提供時期・契約期間・解約・返金を、利用規約「料金」・特商法の表記と同じ中身で書く。
 * 在籍スタッフ人数の上限（019 §13.4）は既定値を見せるだけにし、「変更」で開いたときだけ入力させる
 * （申し込む直前に数字を決めさせない）。料金を読んだあと、申し込むボタンの直前に置く
 */
export function SubscribeClient({ activeStaffCount, trialLastDay, billingAvailable }: Props) {
  const [isPending, startTransition] = useTransition()
  // 最初は在籍数より大きい次の 5 の倍数（最小 15）、下限は在籍数
  const [staffCap, setStaffCap] = useState<number | ''>(() => suggestedStaffCap(activeStaffCount))
  const [editingCap, setEditingCap] = useState(false)
  const minCap = minStaffCap(activeStaffCount)
  const capError = staffCapError(staffCap, minCap)

  const submit = () =>
    startTransition(async () => {
      const r = await startCheckout({ staffCap })
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
            在籍スタッフ（全店舗の合計）{FREE_STAFF_LIMIT} 人まで無料、{FREE_STAFF_LIMIT + 1}{' '}
            人目から 1 人あたり月額 {PRICE_PER_STAFF_YEN} 円（税込）
          </Text>
          <Text size="sm">
            いまの人数（{activeStaffCount} 人）なら月額{' '}
            {monthlyPriceYen(activeStaffCount).toLocaleString()} 円
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
    { label: 'ご利用開始', value: 'お申し込み後すぐ' },
    {
      label: '契約期間・解約',
      value:
        '1 か月ごとの自動更新です。いつでも解約でき、その期間の終わりまで使えます。日割り・返金はありません（法令で定める場合を除く）',
    },
  ]

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>お申し込み内容の確認</Title>

        <SettingsSection title="有料プラン">
          {/* スマホでは項目名を内容の上に置く（横に並べると内容の列が細くなって折り返す） */}
          <Stack gap="sm">
            {rows.map((row, index) => (
              <Stack key={row.label} gap="sm">
                {index > 0 && <Divider />}
                <Flex direction={{ base: 'column', xs: 'row' }} gap={{ base: 4, xs: 'md' }}>
                  <Text size="sm" fw={600} c="dimmed" w={{ xs: 120 }} style={{ flexShrink: 0 }}>
                    {row.label}
                  </Text>
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    {typeof row.value === 'string' ? <Text size="sm">{row.value}</Text> : row.value}
                  </Box>
                </Flex>
              </Stack>
            ))}
          </Stack>
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

        {/* 申し込む前に目に留まるよう、プランの案内の青で枠を塗る（theme.ts）。ほかのセクションと同じく見出しと説明は枠の外 */}
        <Stack component="section" gap="xs">
          <Stack gap={2}>
            <Title order={4}>在籍スタッフ人数の上限</Title>
            <Text size="sm" c="dimmed">
              思わぬ請求を防ぐために、スタッフ数の上限を設定できます。上限はいつでも変更できます。
            </Text>
          </Stack>
          <Paper bg="blue.0" bd="1px solid var(--mantine-color-blue-2)" p="lg">
            <Stack gap="md">
              {editingCap ? (
                <Stack gap="sm" align="flex-start">
                  <StaffCapField
                    value={staffCap}
                    onChange={setStaffCap}
                    min={minCap}
                    label="上限の人数"
                    showMaxPrice={false}
                    showBillingNote={false}
                    error={staffCap === '' ? null : capError}
                  />
                  <Button onClick={() => setEditingCap(false)} disabled={capError !== null}>
                    この人数にする
                  </Button>
                </Stack>
              ) : (
                <Group justify="space-between" align="center">
                  <Text fz="xl" fw={700}>
                    {staffCap} 人
                  </Text>
                  <Button variant="default" onClick={() => setEditingCap(true)}>
                    変更
                  </Button>
                </Group>
              )}
              {capError === null && typeof staffCap === 'number' && (
                <Text size="sm">
                  実際の請求金額はその月の在籍スタッフの最大人数で決まります。上限 {staffCap}{' '}
                  人なら、
                  <Text span fw={700} inherit>
                    毎月の料金は最大 {monthlyPriceYen(staffCap).toLocaleString()} 円
                  </Text>
                  です。
                </Text>
              )}
            </Stack>
          </Paper>
        </Stack>

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
          <Button
            onClick={submit}
            loading={isPending}
            disabled={!billingAvailable || capError !== null}
          >
            カード情報の入力へ
          </Button>
        </Group>
      </Stack>
    </Container>
  )
}
