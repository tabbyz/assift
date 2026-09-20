import iconv from 'iconv-lite'

/**
 * CSV の文字コード（010 §3.6 / §5.4）。v1 の `?encoding=utf8` をそのまま移植する
 * （UI からは切り替えられない隠しパラメータ）。
 */
export const CSV_ENCODINGS = { cp932: 'cp932', utf8: 'utf8' } as const

export type CsvEncoding = (typeof CSV_ENCODINGS)[keyof typeof CSV_ENCODINGS]

/** BOM（Excel に UTF-8 だと伝える） */
const BOM = '﻿'

/** v1 の `params[:encoding] == "utf8"`。それ以外は CP932 */
export function resolveCsvEncoding(value: string | null): CsvEncoding {
  return value === CSV_ENCODINGS.utf8 ? CSV_ENCODINGS.utf8 : CSV_ENCODINGS.cp932
}

/** `Content-Type` の charset（`attachment` なので実害は無いが、正しい情報を出さない理由も無い） */
export function csvContentType(encoding: CsvEncoding): string {
  return encoding === CSV_ENCODINGS.utf8 ? 'text/csv; charset=utf-8' : 'text/csv; charset=Shift_JIS'
}

export function encodeCsv(text: string, encoding: CsvEncoding): Buffer {
  if (encoding === CSV_ENCODINGS.utf8) return Buffer.from(BOM + text, 'utf8')
  return iconv.encode(replaceUnmappable(text), CSV_ENCODINGS.cp932)
}

/**
 * CP932 で表せない文字を `〓` にする（v1 の `encode(..., undef: :replace, replace: "〓")`）。
 *
 * **エンコードの前に文字単位で置き換える**。iconv-lite の未マッピング文字は既定で `?` になり、
 * `defaultCharSingleByte` は名前のとおり 1 バイト文字しか指定できないので、
 * CP932 で 2 バイトの `〓`（0x81AC）はオプションでは指定できない（010 §3.7）。
 *
 * `?` で済ませない理由は 2 つ。(1) 012 のバイト比較が絵文字入りの店舗で差分だらけになる。
 * (2) `?` はユーザーが自分で入力しうる文字なので、「変換できなかった」ことが読み手に伝わらない。
 */
function replaceUnmappable(text: string): string {
  // 表せない文字は `?`（1 バイト）に落ちるので、全体の往復が一致すれば 1 文字ずつ調べる必要は無い
  if (roundTrip(text) === text) return text

  let replaced = ''
  // コードポイント単位で回す。絵文字（サロゲートペア）も 1 文字として扱う
  for (const char of text) replaced += roundTrip(char) === char ? char : '〓'
  return replaced
}

function roundTrip(value: string): string {
  return iconv.decode(iconv.encode(value, CSV_ENCODINGS.cp932), CSV_ENCODINGS.cp932)
}
