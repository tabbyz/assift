import { v5 as uuidv5 } from 'uuid'

/**
 * v1（Rails）の ID から v2 の uuid 主キーを決定的に導出する（001 §3.1・021 §3-6）。
 *
 * 対応表や `legacy_id` 列を持たず、`uuidv5('<table>:<v1 id>', V1_UUID_NAMESPACE)` で毎回同じ uuid を得る。
 * **旧 URL の解決（005）と 021 のインポートスクリプトが同じこの関数を使う**ことで、
 * 導出の一致を構造的に保証する。名前の組み立てをここ以外に書かない。
 */

/**
 * uuid v5 の名前空間。**秘密ではないが、絶対に変えない**（021 §3-6）。
 *
 * - 旧 URL の 308 はブラウザに永続キャッシュされ、導出される店舗 id もすべて変わる
 * - 本番・インポート・リハーサル・プレビューの 4 か所で同じ値でなければならないので、設定ではなく定数
 * - 値は `uuidgen` で作った v4（推測できる値にしない。v1 の連番 id と合わせて全行の id を外から計算させない）
 *
 * `v1Ids.test.ts` が値を固定している。
 */
export const V1_UUID_NAMESPACE = '4b880c2f-808c-4326-9bbd-3497ab1056e1'

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
 * `uuidv5('<table>:<id>', V1_UUID_NAMESPACE)`。
 * tenants だけは整数 ID ではなく v1 の 22 文字トークンを id に渡す（001 §3.1）。
 */
export function v1Uuid(table: V1Table, id: string | number): string {
  return v1UuidIn(V1_UUID_NAMESPACE, table, id)
}

/**
 * 名前空間を引数で受ける版。**テスト（ライブラリの使い方の確認）専用**。
 * アプリとスクリプトは `v1Uuid()` を使い、別の名前空間を渡せる口を持たない（021 §3-6）。
 */
export function v1UuidIn(namespace: string, table: V1Table, id: string | number): string {
  return uuidv5(`${table}:${id}`, namespace)
}
