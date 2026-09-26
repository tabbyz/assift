import type { AssistLever, AssistUnfilled } from '@/lib/assist/result'
import { cellKey, type ShiftMap } from '@/lib/shifts/key'
import {
  countAt,
  coverageAt,
  type CountsByDate,
  type DateCoverage,
  type RequiredNumRow,
} from '@/lib/shifts/satisfaction'

/**
 * 自動アサインのモーダルと結果のパネルが Client で数えるもの（012 §4 / §11）。サーバー呼び出しなし。
 */

export type Shortage = {
  total: number
  /** 表示順。不足 0 のパターンは出さない */
  byPattern: { patternId: string; name: string; count: number }[]
}

/** 表示期間の不足枠（`max(0, 必要人数 − 配置済み)`）を出勤日パターンごとに数える。サーバーの buildProblem と同じ規則 */
export function shortageByPattern(
  dates: string[],
  workdayPatterns: { id: string; name: string }[],
  required: CountsByDate,
  assigned: CountsByDate
): Shortage {
  const byPattern = workdayPatterns
    .map((pattern) => ({
      patternId: pattern.id,
      name: pattern.name,
      count: dates.reduce(
        (sum, date) =>
          sum +
          Math.max(0, countAt(required, date, pattern.id) - countAt(assigned, date, pattern.id)),
        0
      ),
    }))
    .filter((item) => item.count > 0)
  return { total: byPattern.reduce((sum, item) => sum + item.count, 0), byPattern }
}

/** 期間に出勤日パターンの必要人数が 1 件でもあるか（無ければ「デフォルト人数をセット」へ案内する） */
export function hasRequiredNums(rows: RequiredNumRow[], workdayPatternIds: Set<string>): boolean {
  return rows.some((row) => row.num > 0 && workdayPatternIds.has(row.patternId))
}

export type AssistStage = {
  key: string
  label: string
  /** 見込みの所要時間（ms） */ estimate: number
}

/**
 * 実行中の段階（§4.3）。同期実行なのでサーバーからは届かない。**経過時間で進める見込み表示**で、
 * 最後の段階は完了まで留まる。見込みは §5.9 の目安（指示の解釈 5〜15 秒・解く 1〜5 秒）。
 * 最後は効く一手の試算（§11.2。残りの枠だけを解くので短い）
 */
export const ASSIST_STAGES: AssistStage[] = [
  { key: 'prepare', label: '準備', estimate: 1_500 },
  { key: 'interpret', label: '指示を解釈', estimate: 9_000 },
  { key: 'solve', label: '割り当てを計算', estimate: 4_000 },
  { key: 'validate', label: '検証', estimate: 1_000 },
  { key: 'levers', label: '改善案を試算', estimate: Number.POSITIVE_INFINITY },
]

/** 指示が無ければ解釈は飛ばす（LLM を呼ばない。§5.1） */
export function currentStage(elapsedMs: number, withInstructions: boolean): number {
  let remaining = elapsedMs
  for (let index = 0; index < ASSIST_STAGES.length; index++) {
    const stage = ASSIST_STAGES[index]
    if (stage.key === 'interpret' && !withInstructions) continue
    if (remaining < stage.estimate) return index
    remaining -= stage.estimate
  }
  return ASSIST_STAGES.length - 1
}

/** 30 秒を超えたら「時間がかかっています…」（§4.3） */
export const ASSIST_SLOW_MS = 30_000

/** `0:07` / `1:05` */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

// ---- 結果のパネル（§11） ------------------------------------------------------

export type UnfilledGridRow = {
  patternId: string
  name: string
  total: number
  /** `dates` と同じ並び。足りない人数（0 は空欄） */
  counts: number[]
}

/**
 * 小さな表で一度に見せる範囲（012 §11.1）。
 * 1 日の幅が `minDayWidth` を下回らない最大日数。続く日があるときは次の日を半分だけ足して、
 * 横にスクロールできることを幅の切れで示す。全部がその幅で収まるときは日数そのもの。
 */
export function gridSpan(
  contentWidth: number,
  dayCount: number,
  labelWidth: number,
  gap: number,
  minDayWidth: number
): { visibleDays: number; visibleGaps: number } {
  if (dayCount <= 0 || minDayWidth <= 0) return { visibleDays: 1, visibleGaps: 2 }
  const fullWidth = labelWidth + (dayCount + 1) * gap + dayCount * minDayWidth
  if (contentWidth >= fullWidth) return { visibleDays: dayCount, visibleGaps: dayCount + 1 }
  const room = contentWidth - labelWidth - gap - 0.5 * minDayWidth
  const fitted = Math.floor(room / (gap + minDayWidth))
  const fullDays = Math.max(1, Math.min(fitted, dayCount - 1))
  return { visibleDays: fullDays + 0.5, visibleGaps: fullDays + 1 }
}

/** 埋まらなかった枠の「パターン × 日」。不足のあるパターンだけ、パターンの表示順 */
export function unfilledGrid(
  unfilled: Pick<AssistUnfilled, 'date' | 'patternId' | 'count'>[],
  patterns: { id: string; name: string }[],
  dates: string[]
): UnfilledGridRow[] {
  const counts = new Map<string, number>()
  for (const slot of unfilled) {
    const key = `${slot.date}|${slot.patternId}`
    counts.set(key, (counts.get(key) ?? 0) + slot.count)
  }
  return patterns
    .map((pattern) => {
      const row = dates.map((date) => counts.get(`${date}|${pattern.id}`) ?? 0)
      return {
        patternId: pattern.id,
        name: pattern.name,
        total: row.reduce((sum, count) => sum + count, 0),
        counts: row,
      }
    })
    .filter((row) => row.total > 0)
}

/** 一手で埋まる枠（`date|patternId`）。小さな表の緑の枠 */
export function leverSlots(lever: Pick<AssistLever, 'rows'>): Set<string> {
  return new Set(lever.rows.map((row) => `${row.date}|${row.patternId}`))
}

/**
 * 表の点線のセル（`cellKey` → パターン）。いま空いているセルだけ
 * （試算のあとに手で埋めたセルには出さない。実行すれば、そのセルは解き直しで別の人に回る）
 */
export function ghostCells(
  lever: Pick<AssistLever, 'rows'>,
  shifts: ShiftMap
): Map<string, string> {
  const cells = new Map<string, string>()
  for (const row of lever.rows) {
    const key = cellKey(row.staffId, row.date)
    if (!shifts.has(key)) cells.set(key, row.patternId)
  }
  return cells
}

/**
 * 一手で埋まったあとの充足（フッターの「3/5 → 4/5」。§11.1）。点線のセル（いま空いているセル）がある日だけ。
 * 数え方はフッターと同じ（出勤日のパターンだけ。ペアの「明け」は数えない）
 */
export function previewCoverage(
  lever: Pick<AssistLever, 'rows'>,
  shifts: ShiftMap,
  workdayPatternIds: string[],
  required: CountsByDate,
  assigned: CountsByDate
): Map<string, DateCoverage> {
  const added: CountsByDate = new Map()
  for (const row of lever.rows) {
    if (shifts.has(cellKey(row.staffId, row.date))) continue
    const byPattern = added.get(row.date) ?? new Map<string, number>()
    byPattern.set(row.patternId, (byPattern.get(row.patternId) ?? 0) + 1)
    added.set(row.date, byPattern)
  }
  const coverage = new Map<string, DateCoverage>()
  for (const [date, extra] of added) {
    const merged = new Map(assigned.get(date))
    for (const [patternId, count] of extra)
      merged.set(patternId, (merged.get(patternId) ?? 0) + count)
    const after = coverageAt(date, workdayPatternIds, required, new Map([[date, merged]]))
    const before = coverageAt(date, workdayPatternIds, required, assigned)
    if (after.assigned !== before.assigned) coverage.set(date, after)
  }
  return coverage
}

/** 「外すと早番 9 枠が埋まります」「3日にすると早番 5 枠・遅番 1 枠が埋まります」 */
export function leverEffect(
  lever: Pick<AssistLever, 'action' | 'relaxedTo' | 'byPattern'>,
  patternNames: Map<string, string>
): string {
  const condition =
    lever.action === 'relax' && lever.relaxedTo !== null ? `${lever.relaxedTo}日にすると` : '外すと'
  const slots = lever.byPattern
    .map((item) => `${patternNames.get(item.patternId) ?? '?'} ${item.count} 枠`)
    .join('・')
  return `${condition}${slots}が埋まります`
}
