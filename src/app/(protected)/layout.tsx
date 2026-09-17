import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser } from '@/utils/auth/current'

// proxy でも未ログインを弾くが、レイアウトでも二重に守る
export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const user = await getAuthUser()
  if (!user) redirect('/login')
  return children
}
