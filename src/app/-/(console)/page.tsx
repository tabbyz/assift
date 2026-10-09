import { redirect } from 'next/navigation'
import { ADMIN_USERS_PATH } from '@/lib/admin/paths'

/** /- はユーザー一覧へ。何も描かないので確認は移動先に任せる */
export default function AdminHomePage() {
  redirect(ADMIN_USERS_PATH)
}
