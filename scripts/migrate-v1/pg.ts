import { types } from 'pg'

/**
 * `date` / `timestamp` / `timestamptz` を文字列のまま受ける（021 §6.1）。
 * `pg` の既定は JS の `Date` にするので、実行環境の TZ で 1 日ずれる。`import.ts` と `verify.ts` が同じ設定を使う
 */
export function keepDateStrings() {
  for (const oid of [1082, 1114, 1184]) types.setTypeParser(oid, (v) => v)
}
