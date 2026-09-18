/**
 * 配列の index の要素を delta だけ動かした新しい配列を返す（v1 の move_higher / move_lower）。
 * 端を越える移動と範囲外の index は、元の配列をそのまま返す（ボタンが disabled でも二重に守る）。
 */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const to = index + delta
  if (index < 0 || index >= items.length) return [...items]
  if (to < 0 || to >= items.length) return [...items]

  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(to, 0, moved)
  return next
}
