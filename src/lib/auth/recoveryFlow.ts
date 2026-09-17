import 'server-only'
import { cookies } from 'next/headers'

/**
 * 「このセッションは再設定リンクから始まった」ことを示す印（004 §3.11）。
 *
 * 再設定リンクを踏むと通常のセッションが張られるため、セッションの有無だけを条件にすると
 * 盗まれた cookie や離席中の端末からでも現在のパスワードなしで変更できてしまう。
 * JWT の `amr` はサインアップ確認も同じ `otp` になり、セッションが切れるまで残るため使わない。
 * /auth/callback（Route Handler）だけが付けられる短命・単回の cookie で経路を固定する。
 */
export const RECOVERY_COOKIE = 'assift-password-recovery'

/** 再設定フォームを開いてパスワードを送るまでの猶予。リンク自体の有効期限（既定 1 時間）とは別 */
const MAX_AGE_SECONDS = 15 * 60

export async function markRecoverySession() {
  const store = await cookies()
  store.set(RECOVERY_COOKIE, '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  })
}

export async function hasRecoverySession(): Promise<boolean> {
  return (await cookies()).has(RECOVERY_COOKIE)
}

/** 使い切り。パスワードを 1 回変更したら消す */
export async function clearRecoverySession() {
  ;(await cookies()).delete(RECOVERY_COOKIE)
}
