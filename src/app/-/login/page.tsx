import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Container } from '@mantine/core'
import { isAdminRequest } from '@/lib/admin/guard'
import { ADMIN_USERS_PATH } from '@/lib/admin/paths'
import { currentUser } from '@/utils/auth/current'
import { AdminLoginForm } from './_components/AdminLoginForm'

export const metadata: Metadata = { title: 'ログイン' }

export default async function AdminLoginPage() {
  if (!(await isAdminRequest())) notFound()
  const user = await currentUser()
  if (user?.isAdmin) redirect(ADMIN_USERS_PATH)

  return (
    <Container size={420} py="xl">
      <AdminLoginForm />
    </Container>
  )
}
