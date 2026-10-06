import type { RequiredNum } from '@/lib/shifts/requiredNums'

/**
 * 日別モーダルの入力欄の規則（015 §4.3）。
 *
 * `required_nums` の行は**この日だけの上書き**なので、モーダルでも
 * 「この日だけ変えてある勤務だけ数が入り、ほかは空欄」にする（基本の人数はプレースホルダで見せる）。
 * 全部に数を入れて見せると、1 つ直して保存しただけで**全勤務に上書きが入り**、その日が基本から外れてしまう。
 */
export type RequiredNumInputRow = {
  patternId: string
  /** 解決後の必要人数（上書き ?? 基本 ?? 未設定） */
  required: RequiredNum
  /** この日だけ変えてある（`required_nums` に行がある）か */
  overridden: boolean
}

/** 入力欄に出す値。触っていない勤務は、上書きがあるときだけ数が入る */
export function requiredNumInputValue(
  row: RequiredNumInputRow,
  typed: number | '' | undefined
): number | '' {
  if (typed !== undefined) return typed
  return row.overridden ? (row.required ?? '') : ''
}

/**
 * 保存に送る形。**どの勤務を送るかは `rows`（Server の props）が決める**（007 §10.2）。
 * 空欄は「この日の上書きを消す」（行が無ければ何も起きない）。
 */
export function requiredNumPayload(
  rows: RequiredNumInputRow[],
  typed: Record<string, number | ''>
): Record<string, number | ''> {
  return Object.fromEntries(
    rows.map((row) => [row.patternId, requiredNumInputValue(row, typed[row.patternId])])
  )
}
