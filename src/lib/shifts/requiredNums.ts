import { dayKeyFor, type DayKey } from '@/lib/calendar/weekdays'
import { type RequiredNumsByDay } from '@/lib/patterns/requiredNums'

/**
 * ある日・ある勤務に必要な人数の解決（015 §3.1）。
 *
 * ```
 * 必要人数(date, pattern) = 上書き(date, pattern) ?? 基本[曜日キー(date)] ?? 未設定
 * ```
 *
 * `required_nums` の行は**「この日だけ変えた」上書きだけ**を持つ。基本の人数
 * （`patterns.default_required_nums`）を期間へ焼き付ける操作（v1 の「デフォルト人数をセット」）は無くなり、
 * 読むときにここで解決する。これで「翌月は 0」「基本を直しても既存の期間に届かない」が同時に消える。
 */

/** 解決後の必要人数。`null` は「まだ決めていない」（0 人とは別。015 §3.2） */
export type RequiredNum = number | null

/** その数がどこから来たか。日別モーダルの「この日だけ変更」の札が使う */
export type RequiredSource = 'override' | 'default' | 'unset'

export type ResolvedRequiredNum = { num: RequiredNum; source: RequiredSource }

/**
 * `required_nums` の 1 行（= この日だけの上書き）。
 * 解決後の「決まっている人数」も同じ形で持ち回る（自動アサインの入力）。
 */
export type RequiredNumRow = { patternId: string; date: string; num: number }

/** `overrideKey()` → 人数 */
export type RequiredOverrideMap = Map<string, number>

/** 日付 → 勤務 → 解決後の必要人数。`assignedCounts()` と同じ形で引ける */
export type RequiredByDate = Map<string, Map<string, RequiredNum>>

export function overrideKey(patternId: string, date: string): string {
  return `${patternId}:${date}`
}

export function toOverrideMap(rows: RequiredNumRow[]): RequiredOverrideMap {
  return new Map(rows.map((row) => [overrideKey(row.patternId, row.date), row.num]))
}

/**
 * 1 マスの解決。`defaults` は `parseRequiredNums()` を通した形、`dayKey` は `dayKeyFor()`（祝日優先）。
 * 上書きの `0` は `0` のまま（基本に落ちない）。
 */
export function resolveRequiredNum(
  overrides: RequiredOverrideMap,
  defaults: RequiredNumsByDay,
  patternId: string,
  date: string,
  dayKey: DayKey
): ResolvedRequiredNum {
  const override = overrides.get(overrideKey(patternId, date))
  if (override !== undefined) return { num: override, source: 'override' }

  const base = defaults[dayKey]
  if (base !== undefined) return { num: base, source: 'default' }

  return { num: null, source: 'unset' }
}

/**
 * 表示期間ぶんの必要人数を組む（Server の page が呼ぶ）。
 * 祝日かどうかは Server が渡す（`lib/calendar/holidays.ts` は `server-only`）。
 */
export function buildRequiredByDate(input: {
  dates: string[]
  patterns: { id: string; defaultRequiredNums: RequiredNumsByDay }[]
  overrides: RequiredOverrideMap
  holidays: ReadonlySet<string>
}): RequiredByDate {
  const result: RequiredByDate = new Map()
  for (const date of input.dates) {
    const dayKey = dayKeyFor(date, input.holidays.has(date))
    const byPattern = new Map<string, RequiredNum>()
    for (const pattern of input.patterns) {
      const { num } = resolveRequiredNum(
        input.overrides,
        pattern.defaultRequiredNums,
        pattern.id,
        date,
        dayKey
      )
      byPattern.set(pattern.id, num)
    }
    result.set(date, byPattern)
  }
  return result
}

/**
 * 期間のうち上書きがある日（「この期間の個別の変更を元に戻す」の確認に並べる。015 §3.6）。
 * **基本と同じ値の上書きも数える**（戻せることを示すため）。`dates` の並び順を保つ。
 */
export function overriddenDates(
  dates: string[],
  patternIds: string[],
  overrides: RequiredOverrideMap
): string[] {
  return dates.filter((date) =>
    patternIds.some((patternId) => overrides.has(overrideKey(patternId, date)))
  )
}

/**
 * 解決した結果を行の配列で返す（自動アサインの入力。`null`（未設定）の組は**行にしない**）。
 * 行が無い = 枠が無い、という `buildProblem()` の読み方は変えずに済む（015 §5.3）。
 */
export function resolveRequiredRows(input: {
  dates: string[]
  patterns: { id: string; defaultRequiredNums: RequiredNumsByDay }[]
  overrides: RequiredOverrideMap
  holidays: ReadonlySet<string>
}): RequiredNumRow[] {
  const rows: RequiredNumRow[] = []
  for (const date of input.dates) {
    const dayKey = dayKeyFor(date, input.holidays.has(date))
    for (const pattern of input.patterns) {
      const { num } = resolveRequiredNum(
        input.overrides,
        pattern.defaultRequiredNums,
        pattern.id,
        date,
        dayKey
      )
      if (num !== null) rows.push({ patternId: pattern.id, date, num })
    }
  }
  return rows
}
