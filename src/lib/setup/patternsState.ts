import type { PatternKind } from '@/lib/patterns/kinds'
import type { SetupPair, SetupPatternRow, SetupPatternsState } from './templates'

/** Server Action に送る形（チェックの付いた行だけ。ペアは使うときだけ） */
export type SetupPatternsInput = {
  patterns: Omit<SetupPatternRow, 'on'>[]
  pair: SetupPair | null
}

/** RPC `save_setup_patterns` に渡す 1 行（014 §5.2） */
export type SetupPatternRpcRow = {
  id: string
  name: string
  description: string
  color_hex: string
  kind: PatternKind
  pair_id: string | null
}

/** DB に保存済みの勤務（`patterns` の列のうち、ここで使うものだけ） */
export type SavedPattern = {
  id: string
  name: string
  description: string | null
  color_hex: string
  kind: PatternKind
  pair_pattern_id: string | null
}

const trimmed = (row: SetupPatternRow) => ({
  ...row,
  name: row.name.trim(),
  description: row.description.trim(),
})

/** ペアのスイッチを出すか（ペアがあり、両方の行がチェック付きで残っている） */
export function isPairAvailable(state: SetupPatternsState): boolean {
  const { pair } = state
  if (!pair) return false
  const on = (key: string) => state.rows.some((row) => row.key === key && row.on)
  return on(pair.fromKey) && on(pair.toKey)
}

/** 保存する形にする。チェックの外れた行と名前が空の行は落とす。ペアは両方残っていて、スイッチがオンのときだけ */
export function selectedPatterns(state: SetupPatternsState): SetupPatternsInput {
  const patterns = state.rows
    .map(trimmed)
    .filter((row) => row.on && row.name !== '')
    .map((row) => ({
      key: row.key,
      name: row.name,
      description: row.description,
      colorHex: row.colorHex,
      kind: row.kind,
    }))
  const keys = new Set(patterns.map((row) => row.key))
  const pair =
    state.pairEnabled && state.pair && keys.has(state.pair.fromKey) && keys.has(state.pair.toKey)
      ? state.pair
      : null
  return { patterns, pair }
}

/** Server Action で RPC の形にする。id は呼び出し側が振る（ペアを id で書くため。014 §5.2） */
export function toRpcPatterns(
  input: SetupPatternsInput,
  newId: () => string
): SetupPatternRpcRow[] {
  const ids = new Map(input.patterns.map((row) => [row.key, newId()]))
  return input.patterns.map((row) => ({
    id: ids.get(row.key)!,
    name: row.name,
    description: row.description,
    color_hex: row.colorHex,
    kind: row.kind,
    pair_id: input.pair && row.key === input.pair.fromKey ? ids.get(input.pair.toKey)! : null,
  }))
}

const NIGHT_NAME = '夜勤'
const AFTER_NAME = '明け'

/**
 * 保存済みの勤務から画面の状態を組み直す（再開とステップ 3 から戻ったとき。014 §5.3）。
 *
 * ペアは名前ではなく `pair_pattern_id` で戻す（「夜勤」を直していても戻せるように）。
 * ペアが無ければ、名前が「夜勤」「明け」の行が両方あるときだけスイッチをオフで出す
 * （業種は保存していないので、オフで保存したペアは名前でしか見つけられない）。
 */
export function fromSavedPatterns(patterns: readonly SavedPattern[]): SetupPatternsState {
  const rows: SetupPatternRow[] = patterns.map((pattern) => ({
    key: pattern.id,
    name: pattern.name,
    description: pattern.description ?? '',
    colorHex: pattern.color_hex,
    kind: pattern.kind,
    on: true,
  }))
  const ids = new Set(patterns.map((pattern) => pattern.id))

  const paired = patterns.find(
    (pattern) => pattern.pair_pattern_id && ids.has(pattern.pair_pattern_id)
  )
  if (paired) {
    return { rows, pair: { fromKey: paired.id, toKey: paired.pair_pattern_id! }, pairEnabled: true }
  }

  const night = patterns.find((pattern) => pattern.name === NIGHT_NAME)
  const after = patterns.find((pattern) => pattern.name === AFTER_NAME)
  if (night && after) {
    return { rows, pair: { fromKey: night.id, toKey: after.id }, pairEnabled: false }
  }
  return { rows, pair: null, pairEnabled: false }
}

/** 再開したときに着地するステップ（014 §5.6）。勤務が 0 件なら 2、あれば 3 */
export function resumeStep(patternCount: number): 2 | 3 {
  return patternCount === 0 ? 2 : 3
}
