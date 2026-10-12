/**
 * エクスポート（PDF / CSV。010）の URL。組むのも判定するのもここだけ: シフト表の共有メニュー（リンク）・
 * v1 の旧 URL の書き換え（proxy）・PDF の応答に CSP を付けない判定（proxy。022）が同じ形を使う。
 *
 * ルート（`app/api/tenants/[tenantId]/shifts/{pdf,csv}`）を動かすときは、ここのほかに
 * `next.config.ts` の `outputFileTracingIncludes`（キーがルートの glob。外れるとフォントが追えず PDF が 500）と
 * `utils/supabase/proxy.ts` の `PROTECTED_PREFIXES`（`/api/tenants`。外れると未ログインの redirect が効かない）も直す
 */
export type ExportKind = 'pdf' | 'csv'

export function exportPath(tenantId: string, kind: ExportKind): string {
  return `/api/tenants/${tenantId}/shifts/${kind}`
}

const PDF_EXPORT_PATH = /^\/api\/tenants\/[^/]+\/shifts\/pdf$/

/**
 * `exportPath(…, 'pdf')` の形か（完全一致）。このパスは Route Handler にしか届かず（PDF / 401 の text / 本文の無い 404。
 * 未ログインは proxy が redirect）、HTML を描かないので、CSP を付けなくても穴にならない（022 §8 のレビュー 9 回目）
 */
export function isPdfExportPath(pathname: string): boolean {
  return PDF_EXPORT_PATH.test(pathname)
}
