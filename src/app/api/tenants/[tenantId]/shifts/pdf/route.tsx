import type { NextRequest } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { contentDisposition, pdfAsciiFilename, pdfFilename } from '@/lib/export/filename'
import { EXPORT_CACHE_CONTROL, loadShiftExport, unauthorizedResponse } from '@/lib/export/request'
import { ShiftPdfDocument } from '@/lib/pdf/ShiftPdfDocument'

/** フォントをファイルシステムから読むので edge には切り替えない（010 §5.2） */
export const runtime = 'nodejs'

/**
 * PDF 出力（v1 `ShiftsController#index` の `format.pdf`）。
 *
 * 期間は `?start=` だけを受け、範囲は店舗の作成周期からサーバーが組み直す（010 §3.1）。
 * v1 と同じく `inline` で返す（ツールバーのリンクが `target="_blank"` なので別タブで開く）。
 *
 * `renderToStream` にしない（010 §5.2）。最初のバイトは早くなるが、途中で失敗すると
 * 壊れた PDF を返してしまう。31 日 × 100 人でも 304KB / 約 1 秒なのでバッファで足りる。
 */
export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/tenants/[tenantId]/shifts/pdf'>
) {
  const { tenantId } = await ctx.params

  // 見えない店舗・uuid でない id は notFound() を投げて戻らない。null は未ログインだけ（010 §5.1）
  const table = await loadShiftExport(tenantId, request.nextUrl.searchParams.get('start'))
  if (!table) return unauthorizedResponse()

  const buffer = await renderToBuffer(<ShiftPdfDocument table={table} />)

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      // ファイル名は日本語なので RFC 5987。ASCII のフォールバックは CSV と同じ `shifts_...`（§5.3）
      'Content-Disposition': contentDisposition(
        'inline',
        pdfFilename(table.start, table.end),
        pdfAsciiFilename(table.start, table.end)
      ),
      'Cache-Control': EXPORT_CACHE_CONTROL,
    },
  })
}
