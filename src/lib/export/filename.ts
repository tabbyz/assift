/**
 * エクスポートのファイル名と `Content-Disposition`（010 §5.3）。
 *
 * v1: PDF = `勤務シフト表_YYYYMMDD-YYYYMMDD`（wicked_pdf が `.pdf` を足す）/ CSV = `shifts_YYYYMMDD-YYYYMMDD.csv`
 */

/** `2026-09-01` → `20260901`（v1 の `strftime("%Y%m%d")`） */
function compact(date: string): string {
  return date.replaceAll('-', '')
}

function period(start: string, end: string): string {
  return `${compact(start)}-${compact(end)}`
}

export function csvFilename(start: string, end: string): string {
  return `shifts_${period(start, end)}.csv`
}

export function pdfFilename(start: string, end: string): string {
  return `勤務シフト表_${period(start, end)}.pdf`
}

/**
 * `Content-Disposition` の ASCII フォールバック（RFC 5987 の `filename*` を読まないクライアント向け）。
 * 日本語を落とすと `_20260901-20260930.pdf` という読めない名前になるので、CSV と同じ `shifts_` にする。
 */
export function pdfAsciiFilename(start: string, end: string): string {
  return `shifts_${period(start, end)}.pdf`
}

/**
 * 日本語のファイル名は `Content-Disposition` に生で書けない（ヘッダは Latin-1）。
 * RFC 5987 の `filename*=UTF-8''<percent-encoded>` を使い、古いクライアント向けに
 * ASCII の `filename=` も併記する。
 *
 * ASCII フォールバックは呼び出し側が渡す（PDF は `pdfAsciiFilename()`、CSV はファイル名そのもの）。
 */
export function contentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string,
  asciiFallback: string
): string {
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(filename)}`
}

/**
 * RFC 5987 の `value-chars`。`encodeURIComponent` が残す `!'()*` まで落とす
 * （`'` はパラメータの区切りと紛れる。`*` は一部の実装が特別扱いする）。
 */
function encodeRfc5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()!*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  )
}
