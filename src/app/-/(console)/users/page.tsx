import type { Metadata } from 'next'
import { Stack, Title } from '@mantine/core'
import { formatJstDate, formatJstDateTime, formatProviders } from '@/lib/admin/format'
import { requireAdminPage } from '@/lib/admin/guard'
import { adminPlanView } from '@/lib/admin/planView'
import { ADMIN_USERS_MAX_PAGE, ADMIN_USERS_PAGE_SIZE, listAdminUsers } from '@/lib/admin/queries'
import { trialLastDay } from '@/lib/billing/trial'
import { formatYearMonthDay } from '@/lib/calendar/dateString'
import { UsersSearch } from './_components/UsersSearch'
import { type UserListItem, UsersTable } from './_components/UsersTable'
import { loadAdminUsersSearchParams } from './searchParams'

export const metadata: Metadata = { title: 'ユーザー' }

export default async function AdminUsersPage({ searchParams }: PageProps<'/-/users'>) {
  await requireAdminPage()
  const { q, page } = await loadAdminUsersSearchParams(searchParams)
  const current = Math.min(Math.max(1, page), ADMIN_USERS_MAX_PAGE)
  const { rows, total } = await listAdminUsers({ q: q.trim(), page: current })

  const now = new Date()
  const items = rows.map((row): UserListItem => {
    const plan = adminPlanView(row, now)
    return {
      id: row.id,
      email: row.email ?? '—',
      createdAt: formatJstDate(row.createdAt),
      lastSignInAt: formatJstDateTime(row.lastSignInAt),
      providers: formatProviders(row.providers),
      plan: plan.label,
      locked: plan.locked,
      trialLastDay: row.trialEnd ? formatYearMonthDay(trialLastDay(new Date(row.trialEnd))) : '—',
      tenantCount: row.tenantCount,
      activeStaffCount: row.activeStaffCount,
    }
  })

  return (
    <Stack gap="md">
      <Title order={2}>ユーザー</Title>
      <UsersSearch />
      <UsersTable items={items} total={total} page={current} pageSize={ADMIN_USERS_PAGE_SIZE} />
    </Stack>
  )
}
