/**
 * アクセス解析に送る URL からクエリとハッシュを落とす（025 §4.2）。`/signup?email=` のメールアドレスを送らない。
 * path（共有コード・uuid）は残す（025 §3-2）。
 *
 * `beforeSend` から呼ぶので投げない（投げると送信ごと落ちる）。`new URL()` で解釈できない値は、最初の `?` / `#` より前を返す
 */
export function stripQueryAndHash(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url.split(/[?#]/, 1)[0]
  }
}
