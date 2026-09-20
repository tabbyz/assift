import 'server-only'
import { notFound } from 'next/navigation'
import { dateRange, defaultStart } from '@/lib/calendar/dateRange'
import { isDateString } from '@/lib/calendar/dateString'
import { todayJst } from '@/lib/calendar/today'
import { getShiftTable } from '@/lib/queries/shiftTable'
import { getTenant } from '@/lib/queries/tenants'
import type { ShiftTable } from '@/lib/shifts/table'
import { getAuthUser } from '@/utils/auth/current'
import { isUuid } from '@/utils/uuid'

/** ブラウザに古い PDF / CSV を再利用させない（v1 のキャッシュバスターの置き換え。010 §3.10） */
export const EXPORT_CACHE_CONTROL = 'private, no-store'

/**
 * 未ログイン。通常は proxy（`PROTECTED_PREFIXES` に `/api/tenants`）が `/login?next=` へ送るので
 * ここには来ない。到達したときに沈黙しないようにだけしておく（010 §3.2）。
 */
export function unauthorizedResponse(): Response {
  return new Response('ログインが必要です', {
    status: 401,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': EXPORT_CACHE_CONTROL },
  })
}

/**
 * エクスポート 2 本（PDF / CSV）の共通の入口: 認証 → 店舗 → 期間 → 表の読み取り（010 §5.1）。
 *
 * **`null` が意味するのは「未ログイン」の 1 つだけ**（呼び出し側が 401 にする）。
 * 見えない店舗・uuid でない id はここで `notFound()` を投げて戻ってこないので、
 * 呼び出し側で理由を切り分ける分岐は要らない（`requireTenant()` と同じ考え方）。
 *
 * **ルート自身が認証を見るのは `app/api/` が `(protected)/layout.tsx` の外にあるから**（010 §3.2）。
 * 守りは proxy（redirect）とここ（401）の 2 枚になる。
 *
 * `?start=` の不正は失敗にしない（010 §3.1）。旧 URL のブックマークから来た人には、
 * エラーではなく今月の表を見せる。期間はサーバーが `dateRange()` で組み直すので、
 * `?start=` をどういじっても 31 日を超える範囲は作れない。
 */
export async function loadShiftExport(
  tenantId: string,
  startParam: string | null
): Promise<ShiftTable | null> {
  const user = await getAuthUser()
  if (!user) return null

  // uuid でない値をそのまま Postgres に投げると 22P02 でログが汚れる（006 §3.11）
  if (!isUuid(tenantId)) notFound()

  const tenant = await getTenant(tenantId)
  // RLS で見えない店舗も存在しない店舗も区別しない（存在を漏らさない）
  if (!tenant) notFound()

  const start = startParam && isDateString(startParam) ? startParam : defaultStart(todayJst())
  const range = dateRange(tenant.shift_cycle, tenant.start_of_week, start)

  return getShiftTable(tenant, range)
}
