'use client'

import { type ReactNode, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Group,
  Progress,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { startTrial } from '@/app/(protected)/actions'
import { LinkButton } from '@/components/LinkButton'
import { SettingsSection } from '@/components/SettingsSection'
import { PortalButton } from '@/components/billing/PortalButton'
import { openStaffCapModal } from '@/components/billing/StaffCapModal'
import { CONTACT_EMAIL } from '@/components/billing/contact'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { unchangedHeadroomMessage } from '@/lib/billing/staffAddition'
import {
  addDays,
  formatJapaneseMonthDay,
  formatJapaneseYearMonthDay as formatDate,
} from '@/lib/calendar/dateString'
import { cancelDuringMigration } from '../actions'

export type BillingView = {
  kind: 'subscription' | 'trial' | 'manual' | 'free'
  /** 在籍スタッフの上限。有料プランは利用者が選んだ上限人数（019 §13。null = まだ決まっていない） */
  limit: number | null
  activeStaffCount: number
  trialAvailable: boolean
  trialLastDay: string | null
  /** トライアルの残り日数（今日を含めない。最終日なら 0） */
  trialDaysLeft: number | null
  /** トライアルの進み（0〜1。バー） */
  trialProgress: number | null
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
    /** 足すと料金が上がるかを見る最大人数。トライアル中（請求の区間の前）も null（§13.5） */
    confirmablePeak: number | null
  } | null
  billingAvailable: boolean
  hasCustomer: boolean
}

type Props = { view: BillingView; checkoutSuccess: boolean }

/** メーターをマスで描く上限（個別契約で大きな上限のときはバーにする） */
const MAX_SEATS = 20

/** 「プランとお支払い」（019 §5.4）。プラン・在籍スタッフ・料金の 3 枚のカード */
export function BillingClient({ view, checkoutSuccess }: Props) {
  const router = useRouter()
  const [isTrialPending, startTrialTransition] = useTransition()
  const [isCancelPending, startCancel] = useTransition()
  const { subscription } = view

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

  const actions = planActions()

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Title order={2}>プランとお支払い</Title>

        <Card title="現在のプラン">
          <Group>
            <PlanBadge view={view} />
          </Group>
          <PlanBody view={view} />
          {actions}
        </Card>

        <StaffCard view={view} />

        <PriceCard view={view} />
      </Stack>
    </Container>
  )

  function planActions(): ReactNode {
    if (view.kind === 'manual') return null
    if (subscription) {
      if (subscription.hasSchedule) {
        return (
          <Stack gap="xs">
            <PortalButton label="お支払い方法・請求書" variant="default" fullWidth />
            {!subscription.cancelLastDay && (
              <Button
                variant="subtle"
                color="red"
                onClick={confirmCancelDuringMigration}
                loading={isCancelPending}
                fullWidth
              >
                解約する
              </Button>
            )}
          </Stack>
        )
      }
      return subscription.discountPercent > 0 ? (
        <Button variant="default" onClick={confirmLegacyPortal} fullWidth>
          お支払い方法・請求書・解約
        </Button>
      ) : (
        <PortalButton label="お支払い方法・請求書・解約" variant="default" fullWidth />
      )
    }
    if (!view.billingAvailable && !view.trialAvailable) return null
    // 無料プランでトライアルを使えるなら、カード不要のトライアルを先に勧める
    const trialFirst = view.kind === 'free' && view.trialAvailable
    return (
      <Stack gap="xs">
        {trialFirst && (
          <Button size="md" onClick={submitTrial} loading={isTrialPending} fullWidth>
            無料トライアルを始める
          </Button>
        )}
        {view.billingAvailable && (
          <LinkButton
            href="/account/billing/subscribe"
            size="md"
            variant={trialFirst ? 'default' : 'filled'}
            fullWidth
          >
            有料プランに申し込む
          </LinkButton>
        )}
        {view.kind === 'trial' && view.billingAvailable && view.trialLastDay && (
          <Text size="xs" c="dimmed" ta="center" style={{ textWrap: 'balance' }}>
            今お申し込みいただいても、{formatJapaneseMonthDay(view.trialLastDay)}までは無料です
          </Text>
        )}
        {!view.billingAvailable && (
          <Text size="xs" c="dimmed" ta="center">
            現在お申し込みを受け付けていません。時間をおいてお試しください。
          </Text>
        )}
      </Stack>
    )
  }
}

/** 設定画面のセクション（見出しは枠の外。アカウント情報などと同じ）。中身は縦に並べる */
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <SettingsSection title={title}>
      <Stack gap="md">{children}</Stack>
    </SettingsSection>
  )
}

/** 数字を大きく、前後の言葉を小さく（「あと 84 日」「300 円」） */
function BigNumber({ before, value, after }: { before?: string; value: string; after?: string }) {
  return (
    <Group gap={6} align="baseline" wrap="nowrap">
      {before && (
        <Text fz="md" fw={500}>
          {before}
        </Text>
      )}
      <Text fz={40} fw={700} lh={1}>
        {value}
      </Text>
      {after && (
        <Text fz="md" fw={500}>
          {after}
        </Text>
      )}
    </Group>
  )
}

/** プランのバッジは 1 つ（並べるとスマホで切れる）。支払いの失敗を優先し、旧料金は料金のカードで示す */
function PlanBadge({ view }: { view: BillingView }) {
  if (view.subscription?.status === 'past_due') return <Badge color="red">お支払いの失敗</Badge>
  switch (view.kind) {
    case 'subscription':
      return <Badge color="dark">有料プラン</Badge>
    case 'trial':
      return (
        <Badge color="blue" variant="light">
          無料トライアル中
        </Badge>
      )
    case 'manual':
      return (
        <Badge color="gray" variant="light">
          個別契約
        </Badge>
      )
    case 'free':
      return (
        <Badge color="gray" variant="light">
          無料プラン
        </Badge>
      )
  }
}

function PlanBody({ view }: { view: BillingView }) {
  const { subscription } = view

  if (view.kind === 'manual') {
    return (
      <Text size="sm">
        在籍 {view.limit} 人までご利用いただけます。ご契約の変更は{' '}
        <Anchor href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Anchor> までお問い合わせください。
      </Text>
    )
  }

  if (view.kind === 'trial' && view.trialLastDay) {
    const nextMonth = Number(addDays(view.trialLastDay, 1).slice(5, 7))
    return (
      <Stack gap="md">
        {view.trialDaysLeft ? (
          <BigNumber before="あと" value={String(view.trialDaysLeft)} after="日" />
        ) : (
          <BigNumber value="今日" after="まで" />
        )}
        <Stack gap={6}>
          <Progress value={(view.trialProgress ?? 0) * 100} color="blue" size="md" radius="xl" />
          <Text size="xs" c="dimmed" ta="right">
            {formatJapaneseMonthDay(view.trialLastDay)}まで
          </Text>
        </Stack>
        <Text size="sm">
          トライアル中は在籍スタッフの人数に関係なく無料です。{nextMonth}月以降も
          {FREE_STAFF_LIMIT + 1} 人以上で使うには、有料プランへのお申し込みが必要です。
        </Text>
      </Stack>
    )
  }

  if (view.kind === 'free' || !subscription) {
    return (
      <Stack gap="xs">
        <Text size="sm">在籍スタッフ {FREE_STAFF_LIMIT} 人まで無料で使えます。</Text>
        {view.trialAvailable && (
          <Text size="sm" c="dimmed">
            無料トライアルを始めると、始めた月から 2
            か月後の月末まで、人数の制限なく試せます。カードの登録は要りません。
          </Text>
        )}
      </Stack>
    )
  }

  return (
    <Stack gap="md">
      {subscription.periodPeak !== null ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            この期間の料金の見込み（{formatJapaneseMonthDay(subscription.periodFirstDay)}〜
            {formatJapaneseMonthDay(subscription.periodLastDay)}）
          </Text>
          <BigNumber
            value={monthlyPriceYen(
              subscription.periodPeak,
              subscription.discountPercent
            ).toLocaleString()}
            after="円"
          />
          <Text size="xs" c="dimmed">
            この期間の在籍スタッフの最大 {subscription.periodPeak}{' '}
            人で計算しています。人数を減らしても見込みは下がりません。
          </Text>
        </Stack>
      ) : (
        view.limit !== null && (
          <Text size="sm">
            在籍スタッフ {view.limit} 人まで登録できます（上限は下で変えられます）。
          </Text>
        )
      )}
      {subscription.status === 'past_due' && (
        <Text size="sm" c="red">
          お支払いができませんでした。「お支払い方法」からカードを更新してください。更新がないまま再試行が尽きると有料プランが終了します。
        </Text>
      )}
      {subscription.cancelLastDay &&
        (subscription.hasSchedule ? (
          <Text size="sm" c="orange.8">
            {formatDate(subscription.cancelLastDay)}で終了予定です。取り消すには{' '}
            <Anchor href={`mailto:${CONTACT_EMAIL}`} inherit>
              {CONTACT_EMAIL}
            </Anchor>{' '}
            までお問い合わせください。
          </Text>
        ) : (
          <Text size="sm" c="orange.8">
            {formatDate(subscription.cancelLastDay)}
            で終了予定です。終了までなら、お支払いの管理画面で解約を取り消せます
            {subscription.discountPercent > 0 && '（取り消せば旧料金のまま続きます）'}。
          </Text>
        ))}
    </Stack>
  )
}

/**
 * 在籍スタッフ。上限があるとき（トライアル中は終わったあとの無料の上限）はメーターで見せる。
 * 有料プランは利用者が選んだ上限人数と「変更」（§13.4）。上限で請求するのではないので、料金の見込みとは分けて書く
 */
function StaffCard({ view }: { view: BillingView }) {
  const count = view.activeStaffCount
  const limit = view.kind === 'trial' ? FREE_STAFF_LIMIT : view.limit
  const limitLabel =
    limit === null
      ? view.kind === 'subscription'
        ? '上限は未設定'
        : '人数の制限なし'
      : view.kind === 'manual'
        ? `ご契約の上限 ${limit} 人`
        : view.kind === 'subscription'
          ? `上限 ${limit} 人`
          : `無料の上限 ${limit} 人`
  const peak = view.subscription?.confirmablePeak ?? null
  const headroom =
    view.kind === 'subscription' && peak !== null ? unchangedHeadroomMessage(count, peak) : null

  return (
    <Card title="在籍スタッフ">
      {/* 上限は数字の行の右に置く（見出しの行に並べるとスマホで折り返す）。上の小さな字は「この期間の料金の見込み」と同じ並べ方 */}
      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          全店舗の合計
        </Text>
        <Group justify="space-between" align="baseline" wrap="nowrap" gap="sm">
          <BigNumber value={String(count)} after="人" />
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
            {limitLabel}
          </Text>
        </Group>
      </Stack>
      {limit !== null && <Meter count={count} limit={limit} />}
      {limit !== null && (
        <Text size="sm" c={count > limit ? 'red' : 'dimmed'}>
          {staffMessage(view.kind, count, limit)}
        </Text>
      )}
      {/* 最大人数で請求するので、今の期間の最大人数までは足しても料金が変わらない（§13.5） */}
      {headroom && (
        <Text size="sm" c="dimmed">
          {headroom}
        </Text>
      )}
      {view.kind === 'subscription' && (
        <Button
          variant="default"
          onClick={() =>
            openStaffCapModal({
              current: view.limit,
              activeStaffCount: count,
              discountPercent: view.subscription?.discountPercent ?? 0,
            })
          }
          fullWidth
        >
          上限を変える
        </Button>
      )}
    </Card>
  )
}

function staffMessage(kind: BillingView['kind'], count: number, limit: number): string {
  const rest = limit - count
  if (kind === 'trial') {
    return rest >= 0
      ? `あと ${rest} 人まで、トライアルが終わっても無料で使えます。`
      : `トライアルが終わると、${limit + 1} 人目からは有料プランへのお申し込みが必要です。`
  }
  if (kind === 'manual') {
    if (rest > 0) return `あと ${rest} 人まで追加できます。`
    if (rest === 0) return 'ご契約の上限に達しています。'
    return `ご契約の上限を ${-rest} 人超えています。お問い合わせください。`
  }
  if (kind === 'subscription') {
    if (rest > 0) return `あと ${rest} 人まで追加できます。`
    if (rest === 0) return '上限に達しています。追加するには上限を引き上げてください。'
    return `上限を ${-rest} 人超えています。スタッフを追加するには上限を引き上げてください。`
  }
  if (rest > 0) return `あと ${rest} 人まで無料で使えます。`
  if (rest === 0) return '無料で使える上限に達しています。'
  return `無料の上限を ${-rest} 人超えています。有料プランに申し込むか、スタッフを退職にしてください。`
}

/** 上限に対する人数。上限が小さければマス、大きければバー。超えていれば赤 */
function Meter({ count, limit }: { count: number; limit: number }) {
  const over = count > limit
  const filled = over ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-blue-6)'
  if (limit > MAX_SEATS) {
    return (
      <Progress
        value={Math.min(100, (count / limit) * 100)}
        color={over ? 'red' : 'blue'}
        size="md"
        radius="xl"
      />
    )
  }
  return (
    <Box
      aria-hidden
      style={{ display: 'grid', gridTemplateColumns: `repeat(${limit}, minmax(0, 1fr))`, gap: 4 }}
    >
      {Array.from({ length: limit }, (_, index) => (
        <Box
          key={index}
          h={10}
          style={{
            borderRadius: 3,
            background: index < count ? filled : 'var(--mantine-color-gray-2)',
          }}
        />
      ))}
    </Box>
  )
}

function PriceCard({ view }: { view: BillingView }) {
  const { subscription } = view
  const discount = subscription?.discountPercent ?? 0
  const unit = discount > 0 ? monthlyPriceYen(FREE_STAFF_LIMIT + 1, discount) : PRICE_PER_STAFF_YEN
  return (
    <Card title="料金">
      <Stack gap={0}>
        <PriceRow label={`${FREE_STAFF_LIMIT} 人まで`} value="無料" />
        <PriceRow
          label={`${FREE_STAFF_LIMIT + 1} 人目から`}
          value={`1 人 ${unit} 円 / 月`}
          note={discount > 0 ? '税込・旧料金（v1 からのご継続）' : '税込'}
          last
        />
      </Stack>
      <Text size="xs" c="dimmed">
        料金はその月に在籍スタッフが最も多かったときの人数で決まり、翌月 1
        日にお支払いいただきます。
      </Text>
      {subscription?.legacyPeriod && (
        <Text size="xs" c="dimmed">
          この期間（{formatDate(subscription.periodLastDay)}まで）は、v1
          で選んでいた上限人数でのお支払いです。次の期間から、上の料金に切り替わります。
        </Text>
      )}
    </Card>
  )
}

function PriceRow({
  label,
  value,
  note,
  last,
}: {
  label: string
  value: string
  note?: string
  last?: boolean
}) {
  return (
    <Group
      justify="space-between"
      align="baseline"
      wrap="nowrap"
      py="sm"
      style={last ? undefined : { borderBottom: '1px solid var(--mantine-color-gray-2)' }}
    >
      <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
        {label}
      </Text>
      <Stack gap={0} align="flex-end">
        <Text size="md" fw={700} ta="right">
          {value}
        </Text>
        {note && (
          <Text size="xs" c="dimmed" ta="right">
            {note}
          </Text>
        )}
      </Stack>
    </Group>
  )
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
