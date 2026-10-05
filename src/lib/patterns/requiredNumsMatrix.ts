import { DAY_KEYS, type DayKey } from '@/lib/calendar/weekdays'
import type { RequiredNumsByDay } from './requiredNums'

/**
 * `設定 > 必要人数` の行列の状態（015 §3.4）。
 *
 * 行 = 勤務、列 = 曜日 + 祝。`NumberInput` の空欄は `''`（= まだ決めていない）のまま持ち、
 * 保存のときにキーごと落とす。`RequiredNumsByDay`（キーが無い = 未設定）と対になる形。
 */
export type RequiredNumsMatrix = Record<string, Partial<Record<DayKey, number | ''>>>

/** 勤務ごとの既定値（jsonb を読んだ形）から行列の初期値を組む */
export function toMatrix(
  patterns: { id: string; defaultRequiredNums: RequiredNumsByDay }[]
): RequiredNumsMatrix {
  return Object.fromEntries(
    patterns.map((pattern) => [pattern.id, { ...pattern.defaultRequiredNums }])
  )
}

/** 1 マスを書き換える。空欄はキーごと消す（「まだ決めていない」に戻す） */
export function setCell(
  matrix: RequiredNumsMatrix,
  patternId: string,
  dayKey: DayKey,
  value: number | ''
): RequiredNumsMatrix {
  const row = { ...(matrix[patternId] ?? {}) }
  if (value === '') delete row[dayKey]
  else row[dayKey] = value
  return { ...matrix, [patternId]: row }
}

/** その曜日の人数を、右（以降）の曜日へコピーする。空欄なら右も空欄にする（祝は末尾なので対象外） */
export function fillForward(matrix: RequiredNumsMatrix, dayKey: DayKey): RequiredNumsMatrix {
  const index = DAY_KEYS.indexOf(dayKey)
  if (index < 0 || index >= DAY_KEYS.length - 1) return matrix

  const next: RequiredNumsMatrix = {}
  for (const [patternId, row] of Object.entries(matrix)) {
    const copied = { ...row }
    for (const later of DAY_KEYS.slice(index + 1)) {
      if (row[dayKey] === undefined) delete copied[later]
      else copied[later] = row[dayKey]
    }
    next[patternId] = copied
  }
  return next
}

/** その勤務の 1 日の合計ではなく、曜日ごとの縦の合計（表の最下行）。全部空欄なら null */
export function columnTotal(matrix: RequiredNumsMatrix, dayKey: DayKey): number | null {
  let total = 0
  let filled = false
  for (const row of Object.values(matrix)) {
    const value = row[dayKey]
    if (value !== undefined && value !== '') {
      total += value
      filled = true
    }
  }
  return filled ? total : null
}

/**
 * 「どの曜日も同じ人数」のスイッチの初期値（015 §3.5）。
 * 勤務ごとに見て、**どの勤務も「全曜日に同じ数が入っている」または「全曜日が空」**なら ON。
 * 1 つでも曜日差があれば OFF（勝手に平らにしない）。
 */
export function isUniform(matrix: RequiredNumsMatrix): boolean {
  return Object.values(matrix).every((row) => {
    const values = DAY_KEYS.map((key) => row[key] ?? '')
    return new Set(values).size <= 1
  })
}

/** スイッチ ON のとき、行に 1 つだけ表示する人数（勤務ごと。全曜日が同じ値のはず） */
export function uniformValue(matrix: RequiredNumsMatrix, patternId: string): number | '' {
  const row = matrix[patternId] ?? {}
  for (const key of DAY_KEYS) {
    const value = row[key]
    if (value !== undefined && value !== '') return value
  }
  return ''
}

/** スイッチ ON のときの書き換え。全曜日 + 祝に同じ値を入れる（空欄なら全部消す） */
export function setUniform(
  matrix: RequiredNumsMatrix,
  patternId: string,
  value: number | ''
): RequiredNumsMatrix {
  const row: Partial<Record<DayKey, number | ''>> = {}
  if (value !== '') for (const key of DAY_KEYS) row[key] = value
  return { ...matrix, [patternId]: row }
}

/**
 * 保存の形（勤務 id → 曜日 → 人数）。**空欄はキーを持たない**（= まだ決めていない）。
 * `patterns.default_required_nums` にそのまま入る形。
 */
export function toSavePayload(matrix: RequiredNumsMatrix): Record<string, RequiredNumsByDay> {
  const result: Record<string, RequiredNumsByDay> = {}
  for (const [patternId, row] of Object.entries(matrix)) {
    const nums: RequiredNumsByDay = {}
    for (const key of DAY_KEYS) {
      const value = row[key]
      if (value !== undefined && value !== '') nums[key] = value
    }
    result[patternId] = nums
  }
  return result
}
