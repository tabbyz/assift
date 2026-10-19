import 'server-only'
import { unstable_rethrow } from 'next/navigation'
import { getTenant } from '@/lib/queries/tenants'

/**
 * お問い合わせに添える店舗（031 §4.4）。RLS で見えたときだけ返す。
 * 読めなくても問い合わせは止めない（エラー画面の「お問い合わせ」から来ることがあり、ここで落ちると問い合わせる道が無くなる）
 */
export async function readContactTenant(
  tenantId: string
): Promise<{ id: string; name: string } | undefined> {
  try {
    const tenant = await getTenant(tenantId)
    return tenant ? { id: tenant.id, name: tenant.name } : undefined
  } catch (error) {
    // Next の制御の例外（redirect・notFound・動的描画への切り替え）は握りつぶさない
    unstable_rethrow(error)
    console.error('[contact] 店舗を読めませんでした', error)
    return undefined
  }
}
