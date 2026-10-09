import { requireAdminPage } from '@/lib/admin/guard'
import { AdminShell } from './_components/AdminShell'

/** 管理画面の枠。ホスト・ログイン・管理者を確かめる（各 page でも確かめる。020 §5） */
export default async function AdminConsoleLayout({ children }: LayoutProps<'/-'>) {
  const user = await requireAdminPage()
  return <AdminShell email={user.email}>{children}</AdminShell>
}
