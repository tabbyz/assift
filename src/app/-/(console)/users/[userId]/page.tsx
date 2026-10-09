import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import { SettingsSection } from '@/components/SettingsSection'
import { formatJstDate, formatJstDateTime, formatProviders } from '@/lib/admin/format'
import { requireAdminPage } from '@/lib/admin/guard'
import { ADMIN_USERS_PATH } from '@/lib/admin/paths'
import { adminPlanView } from '@/lib/admin/planView'
import { getAdminUserDetail } from '@/lib/admin/queries'
import { canEditTrial, canEndTrialNow } from '@/lib/admin/trial'
import { trialLastDay } from '@/lib/billing/trial'
import { isUuid } from '@/utils/uuid'
import { PlanControls } from './_components/PlanControls'
import { TenantList } from './_components/TenantList'

export const metadata: Metadata = { title: 'ユーザー' }

export default async function AdminUserPage({ params }: PageProps<'/-/users/[userId]'>) {
  await requireAdminPage()
  const { userId } = await params
  if (!isUuid(userId)) notFound()
  const user = await getAdminUserDetail(userId)
  if (!user) notFound()

  const now = new Date()
  const activeStaffCount = user.tenants.reduce(
    (sum, t) => sum + t.staffs.filter((s) => s.retiredAt === null).length,
    0
  )
  const status = user.subscription?.status ?? null
  const plan = adminPlanView(
    {
      subscriptionStatus: status,
      trialEnd: user.trialEnd,
      manualLimit: user.manualLimit,
      staffCap: user.staffCap,
      activeStaffCount,
    },
    now
  )
  const trialEnd = user.trialEnd ? new Date(user.trialEnd) : null
  const subscription = user.subscription

  return (
    <Stack gap="xl">
      <Stack gap={4}>
        <LinkAnchor href={ADMIN_USERS_PATH} size="sm">
          ← ユーザー一覧
        </LinkAnchor>
        <Title order={2}>{user.email ?? '—'}</Title>
      </Stack>

      <SettingsSection title="アカウント">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <Field label="登録日" value={formatJstDate(user.createdAt)} />
          <Field label="最終ログイン" value={formatJstDateTime(user.lastSignInAt)} />
          <Field label="登録方法" value={formatProviders(user.providers)} />
          <Field label="メールの確認" value={user.emailConfirmedAt ? '確認済み' : '未確認'} />
          <Field label="ユーザー ID" value={user.id} />
        </SimpleGrid>
      </SettingsSection>

      <SettingsSection title="プラン" description={plan.reason}>
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <Field label="契約" value={plan.label} />
            <Field
              label="在籍スタッフ（全店舗）"
              value={`${activeStaffCount}人 / ${plan.limitLabel}${plan.locked ? '（ロック中）' : ''}`}
            />
            <Field
              label="有料プランの契約（写し）"
              value={
                subscription
                  ? `${subscription.status}・${formatJstDate(subscription.currentPeriodStart)}〜${formatJstDate(subscription.currentPeriodEnd)}${subscription.cancelAt ? `・${formatJstDate(subscription.cancelAt)}に解約予定` : ''}${subscription.discountPercent ? `・${subscription.discountPercent}%引き` : ''}${subscription.hasSchedule ? '・v1 から切り替え待ち' : ''}`
                  : 'なし'
              }
            />
            <Field
              label="上限人数（利用者が選んだ値）"
              value={user.staffCap === null ? '—' : `${user.staffCap}人`}
            />
          </SimpleGrid>
          {/* 操作のあとの再描画で入力の初期値を取り直す（useState は props の変化を拾わない） */}
          <PlanControls
            key={`${user.trialEnd}:${user.manualLimit}`}
            userId={user.id}
            trialLastDay={trialEnd ? trialLastDay(trialEnd) : null}
            canEditTrial={canEditTrial(status)}
            canEndTrialNow={canEndTrialNow(status, trialEnd, now)}
            manualLimit={user.manualLimit}
          />
        </Stack>
      </SettingsSection>

      <SettingsSection title={`店舗（${user.tenants.length}）`} padded={user.tenants.length === 0}>
        {user.tenants.length === 0 ? (
          <Text size="sm" c="dimmed">
            店舗はありません
          </Text>
        ) : (
          <TenantList
            tenants={user.tenants.map((t) => ({
              id: t.id,
              name: t.name,
              createdAt: formatJstDate(t.createdAt),
              setupCompleted: t.setupCompletedAt !== null,
              activeStaffs: t.staffs.filter((s) => s.retiredAt === null).map((s) => s.name),
              retiredStaffs: t.staffs.filter((s) => s.retiredAt !== null).map((s) => s.name),
              patternCount: t.patternCount,
              assistRunCount: t.assistRunCount,
              lastAssistRunAt: formatJstDateTime(t.lastAssistRunAt),
            }))}
          />
        )}
      </SettingsSection>
    </Stack>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" style={{ wordBreak: 'break-all' }}>
        {value}
      </Text>
    </Stack>
  )
}
