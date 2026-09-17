import { v5 as uuidv5, validate as isRfcUuid } from 'uuid'

/**
 * v1（Rails）の ID から v2 の uuid 主キーを決定的に導出する（001 §3.1）。
 *
 * 対応表や `legacy_id` 列を持たず、`uuidv5('<table>:<v1 id>', NS)` で毎回同じ uuid を得る。
 * **旧 URL の解決（005）と 012 のインポートスクリプトが同じこの関数を使う**ことで、
 * 導出の一致を構造的に保証する。名前の組み立てをここ以外に書かない。
 */

/** v1 のテーブル名。名前の衝突を避けるため接頭辞に使う */
export type V1Table =
  | 'users'
  | 'tenants'
  | 'staffs'
  | 'patterns'
  | 'shifts'
  | 'required_nums'
  | 'restrictions'
  | 'events'
  | 'shares'
  | 'usage_records'

/**
 * `uuidv5('<table>:<id>', namespace)`。
 * tenants だけは整数 ID ではなく v1 の 22 文字トークンを id に渡す（001 §3.1）。
 *
 * namespace は RFC 準拠の uuid でなければならない（uuid パッケージの v5 は
 * そうでない値に対して "Invalid UUID" を投げる）。呼び出し前に
 * `getV1UuidNamespace()` を通すこと。
 */
export function v1Uuid(table: V1Table, id: string | number, namespace: string): string {
  return uuidv5(`${table}:${id}`, namespace)
}

/**
 * 環境変数 `V1_UUID_NAMESPACE` を読む。未設定・不正なら null。
 *
 * ここだけは `isUuid()`（緩い判定）ではなく uuid パッケージの `validate()` を使う。
 * v5 の内部で namespace を parse するため、RFC 非準拠の値だと例外になるので、
 * 「呼べる値かどうか」を同じ基準で判定する必要がある。
 */
export function getV1UuidNamespace(): string | null {
  const value = process.env.V1_UUID_NAMESPACE
  return value && isRfcUuid(value) ? value : null
}
