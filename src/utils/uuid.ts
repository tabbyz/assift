/**
 * uuid 形式の判定。
 *
 * `z.uuid()` や uuid パッケージの `validate()` は RFC 9562 の version / variant ビットまで検査するため、
 * seed の `22222222-2222-2222-2222-222222222222` のような id を弾いてしまう。
 * アプリが実際に扱うのは「Postgres の uuid 型が受ける値」なので、8-4-4-4-12 の hex だけを見る。
 * 認可は RLS が担うので、ここが緩くても境界は崩れない（005 §3.2）。
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}
