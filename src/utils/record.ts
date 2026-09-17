/**
 * ユーザー入力のキーで定数マップを引く。
 * 素の `map[key]` は `constructor` や `__proto__` でプロトタイプ上の値を返してしまうため、
 * 自分自身が持つキーのときだけ値を返す。
 */
export function lookup<T>(
  record: Record<string, T>,
  key: string | undefined | null
): T | undefined {
  if (!key) return undefined
  return Object.hasOwn(record, key) ? record[key] : undefined
}
