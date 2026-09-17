import 'server-only'
import { getAuthUser } from '@/utils/auth/current'
import { ActionError } from './error'

/** ログイン必須。未ログインなら ActionError を投げる */
export async function requireUser() {
  const user = await getAuthUser()
  if (!user) throw new ActionError('ログインが必要です')
  return user
}

// requireAdmin は profiles テーブル（003）を作ってから追加する
