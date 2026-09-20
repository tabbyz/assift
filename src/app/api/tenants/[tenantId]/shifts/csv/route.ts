import type { NextRequest } from 'next/server'
import { csvContentType, encodeCsv, resolveCsvEncoding } from '@/lib/csv/encode'
import { toShiftCsv } from '@/lib/csv/shiftCsv'
import { contentDisposition, csvFilename } from '@/lib/export/filename'
import { EXPORT_CACHE_CONTROL, loadShiftExport, unauthorizedResponse } from '@/lib/export/request'

/** `fs` を使う PDF 側とそろえる。edge には切り替えない（010 §5.2） */
export const runtime = 'nodejs'

/**
 * CSV エクスポート（v1 `ShiftsController#index` の `format.csv`）。
 *
 * 期間は `?start=` だけを受け、範囲は店舗の作成周期からサーバーが組み直す（010 §3.1）。
 * `?encoding=utf8` で BOM 付き UTF-8 になる（v1 と同じ隠しパラメータ。UI からは切り替えられない）。
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/tenants/[tenantId]/shifts/csv'>
) {
  const { tenantId } = await ctx.params
  const params = request.nextUrl.searchParams

  // 見えない店舗・uuid でない id は notFound() を投げて戻らない。null は未ログインだけ（010 §5.1）
  const table = await loadShiftExport(tenantId, params.get('start'))
  if (!table) return unauthorizedResponse()

  const encoding = resolveCsvEncoding(params.get('encoding'))
  const filename = csvFilename(table.start, table.end)

  return new Response(new Uint8Array(encodeCsv(toShiftCsv(table), encoding)), {
    headers: {
      'Content-Type': csvContentType(encoding),
      'Content-Disposition': contentDisposition('attachment', filename, filename),
      'Cache-Control': EXPORT_CACHE_CONTROL,
    },
  })
}
