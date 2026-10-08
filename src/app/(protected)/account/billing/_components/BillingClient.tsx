'use client'

import { useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Anchor,
  Badge,
  Button,
  Container,
  Group,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableTr,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { startTrial } from '@/app/(protected)/actions'
import { LinkButton } from '@/components/LinkButton'
import { SettingsSection } from '@/components/SettingsSection'
import { PortalButton } from '@/components/billing/PortalButton'
import { CONTACT_EMAIL } from '@/components/billing/contact'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { formatJapaneseYearMonthDay as formatDate } from '@/lib/calendar/dateString'
import { cancelDuringMigration } from '../actions'

export type BillingView = {
  kind: 'subscription' | 'trial' | 'manual' | 'free'
  limit: number | null
  activeStaffCount: number
  trialAvailable: boolean
  trialLastDay: string | null
  /** 有効な契約（active / trialing / past_due）。それ以外は null */
  subscription: {
    status: string
    /** 旧料金のクーポン（50）。0 = なし */
    discountPercent: number
    /** v1 からの切り替えの schedule が付いている（ポータルで解約できないので「解約する」をアプリで受ける） */
    hasSchedule: boolean
    /** 今の期間を旧 price（v1 で選んでいた上限人数）で請求する。切り替え直後の 1 日は schedule があっても false */
    legacyPeriod: boolean
    periodFirstDay: string
    periodLastDay: string
    cancelLastDay: string | null
    /** 今の請求期間の最大人数（ここまで）。見込みを出せないとき（切り替え待ち）は null */
    periodPeak: number | null
  } | null
  billingAvailable: boolean
  hasCustomer: boolean
}

type Props = { view: BillingView; checkoutSuccess: boolean }

const PRICE_RULE = `在籍スタッフ ${FREE_STAFF_LIMIT} 人までは無料、${FREE_STAFF_LIMIT + 1} 人目から 1 人あたり月 ${PRICE_PER_STAFF_YEN} 円（税込）`

/** 「プランとお支払い」（019 §5.4） */
export function BillingClient({ view, checkoutSuccess }: Props) {
  const router = useRouter()
  const [isTrialPending, startTrialTransition] = useTransition()
  const [isCancelPending, startCancel] = useTransition()
  const { subscription } = view
  const legacy = (subscription?.discountPercent ?? 0) > 0

  // Checkout から戻った（同期は page が済ませている）。通知を出したらクエリを消す。
  // id は二重表示よけ（開発時の StrictMode でエフェクトが 2 回走る。同じ id の通知は Mantine が重ねない）
  useEffect(() => {
    if (!checkoutSuccess) return
    notifications.show(
      subscription
        ? {
            id: 'checkout-success',
            message: '有料プランのお申し込みが完了しました',
            color: 'green',
          }
        : {
            id: 'checkout-success',
            message: 'お申し込みを確認しています。しばらくしてから再読み込みしてください',
            color: 'yellow',
          }
    )
    router.replace('/account/billing')
  }, [checkoutSuccess, subscription, router])

  const submitTrial = () =>
    startTrialTransition(async () => {
      const r = await startTrial()
      notifications.show(
        r.ok
          ? {
              message: `無料トライアルを始めました（${formatDate(r.data.trialLastDay)}まで）`,
              color: 'green',
            }
          : { message: r.error, color: 'red' }
      )
    })

  const confirmCancelDuringMigration = () =>
    modals.openConfirmModal({
      title: '有料プランを解約',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {subscription &&
              `${formatDate(subscription.periodLastDay)}まで使え、その後は無料プラン（在籍 ${FREE_STAFF_LIMIT} 人まで）に戻ります。`}
          </Text>
          <Text size="sm" c="red">
            解約すると旧料金には戻れません。
          </Text>
        </Stack>
      ),
      labels: { confirm: '解約する', cancel: 'キャンセル' },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        startCancel(async () => {
          const r = await cancelDuringMigration()
          notifications.show(
            r.ok
              ? { message: '解約の手続きをしました', color: 'green' }
              : { message: r.error, color: 'red' }
          )
        }),
    })

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>プランとお支払い</Title>

        <SettingsSection title="現在のプラン" footer={planActions()}>
          <Stack gap="sm">
            <Group gap="xs">
              <Text fw={700}>{planName(view)}</Text>
              {subscription?.status === 'past_due' && <Badge color="red">お支払いの失敗</Badge>}
            </Group>
            <PlanDetails view={view} />
          </Stack>
        </SettingsSection>

        <SettingsSection title="人数と料金">
          <Table variant="vertical" layout="fixed" withTableBorder={false}>
            <TableTbody>
              <TableTr>
                <TableTh w={200}>在籍スタッフ（全店舗の合計）</TableTh>
                <TableTd>
                  {view.activeStaffCount} 人{view.limit !== null && `（上限 ${view.limit} 人）`}
                </TableTd>
              </TableTr>
              {subscription && subscription.periodPeak !== null && (
                <>
                  <TableTr>
                    <TableTh>今の請求期間</TableTh>
                    <TableTd>
                      {formatDate(subscription.periodFirstDay)}〜
                      {formatDate(subscription.periodLastDay)}
                    </TableTd>
                  </TableTr>
                  <TableTr>
                    <TableTh>この期間の最大人数</TableTh>
                    <TableTd>{subscription.periodPeak} 人</TableTd>
                  </TableTr>
                  <TableTr>
                    <TableTh>この期間の料金の見込み</TableTh>
                    <TableTd>
                      {monthlyPriceYen(
                        subscription.periodPeak,
                        subscription.discountPercent
                      ).toLocaleString()}{' '}
                      円（税込）
                    </TableTd>
                  </TableTr>
                </>
              )}
              <TableTr>
                <TableTh>料金</TableTh>
                <TableTd>
                  {legacy
                    ? `旧料金: ${FREE_STAFF_LIMIT + 1} 人目から 1 人あたり月 ${Math.floor((PRICE_PER_STAFF_YEN * (100 - (subscription?.discountPercent ?? 0))) / 100)} 円（税込）`
                    : PRICE_RULE}
                </TableTd>
              </TableTr>
            </TableTbody>
          </Table>
          {subscription?.legacyPeriod && (
            <Text size="sm" c="dimmed" mt="sm">
              この期間（{formatDate(subscription.periodLastDay)}まで）は v1
              で選んでいた上限人数で請求されます。次の期間からは、その期間に在籍スタッフが最も多かったときの人数で請求します。
            </Text>
          )}
          {subscription && subscription.periodPeak !== null && (
            <Text size="sm" c="dimmed" mt="sm">
              料金は期間の終わりに締め、その期間に在籍スタッフが最も多かったときの人数で決まります。期間の途中で人数を減らしても、見込みは下がりません。
            </Text>
          )}
        </SettingsSection>
      </Stack>
    </Container>
  )

  function planActions() {
    if (view.kind === 'manual') return null
    if (subscription) {
      if (subscription.hasSchedule) {
        return (
          <Group gap="xs">
            {!subscription.cancelLastDay && (
              <Button
                variant="subtle"
                color="red"
                onClick={confirmCancelDuringMigration}
                loading={isCancelPending}
              >
                解約する
              </Button>
            )}
            <PortalButton label="お支払い方法・請求書" variant="default" />
          </Group>
        )
      }
      return legacy ? (
        <Button variant="default" onClick={confirmLegacyPortal}>
          お支払い方法・請求書・解約
        </Button>
      ) : (
        <PortalButton label="お支払い方法・請求書・解約" variant="default" />
      )
    }
    return (
      <Group gap="xs">
        {view.trialAvailable && (
          <Button variant="default" onClick={submitTrial} loading={isTrialPending}>
            無料トライアルを始める
          </Button>
        )}
        {view.billingAvailable && (
          <LinkButton href="/account/billing/subscribe">有料プランに申し込む</LinkButton>
        )}
      </Group>
    )
  }
}

/** 旧料金の人はポータルへ進む前に「解約すると旧料金には戻れません」を出す（§5.4） */
function confirmLegacyPortal() {
  modals.open({
    title: 'お支払い方法・請求書・解約',
    children: (
      <Stack gap="md">
        <Text size="sm">
          旧料金（v1
          からの継続）でご利用中です。解約すると旧料金には戻れません。解約を予約したあとでも、期間の終わりまでに取り消せば旧料金のまま続きます。
        </Text>
        <Group justify="flex-end">
          <PortalButton label="お支払いの管理画面へ" />
        </Group>
      </Stack>
    ),
  })
}

function planName(view: BillingView): string {
  switch (view.kind) {
    case 'subscription':
      return (view.subscription?.discountPercent ?? 0) > 0 ? '有料プラン（旧料金）' : '有料プラン'
    case 'trial':
      return '無料トライアル中'
    case 'manual':
      return '個別契約'
    case 'free':
      return '無料プラン'
  }
}

function PlanDetails({ view }: { view: BillingView }) {
  const { subscription } = view
  if (view.kind === 'manual') {
    return (
      <Text size="sm">
        在籍 {view.limit} 人までご利用いただけます。ご契約の変更は{' '}
        <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor> までお問い合わせください。
      </Text>
    )
  }
  if (view.kind === 'trial') {
    return (
      <Text size="sm">
        {view.trialLastDay && `${formatDate(view.trialLastDay)}まで`}
        、在籍スタッフの人数の制限なく無料で使えます。続けて使うには有料プランにお申し込みください（トライアルの終わる日までは請求しません）。
      </Text>
    )
  }
  if (view.kind === 'free' || !subscription) {
    return (
      <Stack gap={4}>
        <Text size="sm">在籍スタッフ {FREE_STAFF_LIMIT} 人まで無料で使えます。</Text>
        {view.trialAvailable && (
          <Text size="sm" c="dimmed">
            無料トライアルを始めると、始めた日から 2
            か月後の月末まで、人数の制限なく試せます（カードの登録は要りません）。
          </Text>
        )}
        {!view.billingAvailable && (
          <Text size="sm" c="dimmed">
            現在お申し込みを受け付けていません。時間をおいてお試しください。
          </Text>
        )}
      </Stack>
    )
  }

  return (
    <Stack gap={4}>
      <Text size="sm">在籍スタッフの人数の制限なく使えます。</Text>
      {subscription.status === 'past_due' && (
        <Text size="sm" c="red">
          お支払いができませんでした。「お支払い方法」からカードを更新してください。更新がないまま再試行が尽きると有料プランが終了します。
        </Text>
      )}
      {subscription.cancelLastDay &&
        (subscription.hasSchedule ? (
          <Text size="sm" c="orange">
            {formatDate(subscription.cancelLastDay)}で終了予定です。取り消すには{' '}
            <Anchor href={`mailto:${CONTACT_EMAIL}`} inherit>
              {CONTACT_EMAIL}
            </Anchor>{' '}
            までお問い合わせください。
          </Text>
        ) : (
          <Text size="sm" c="orange">
            {formatDate(subscription.cancelLastDay)}
            で終了予定です。終了までなら、お支払いの管理画面で解約を取り消せます
            {subscription.discountPercent > 0 && '（取り消せば旧料金のまま続きます）'}。
          </Text>
        ))}
    </Stack>
  )
}
