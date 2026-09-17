import 'server-only'
import { currentUser, getAuthUser } from '@/utils/auth/current'
import { ActionError } from './error'

/** ログイン必須。未ログインなら ActionError を投げる */
export async function requireUser() {
  const user = await getAuthUser()
  if (!user) throw new ActionError('ログインが必要です')
  return user
}

/** 管理者必須。auth.users.user_metadata ではなく profiles.is_admin を信頼する */
export async function requireAdmin() {
  const user = await currentUser()
  if (!user?.isAdmin) throw new ActionError('権限がありません')
  return user
}
