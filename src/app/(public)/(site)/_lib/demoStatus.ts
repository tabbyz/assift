import { wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { countAt, requiredAt, type CountsByDate } from '@/lib/shifts/satisfaction'
import type { RequiredByDate } from '@/lib/shifts/requiredNums'
import type { DemoShortage } from './demoAssist'

/**
 * LP のデモの「状況の行」の文（016 §8）。行の高さは 2 行で固定し、各行は 1 行に収める（スマホの幅で 24 文字前後）。
 * 長い文は省略（…）で切れるだけで高さは変わらないが、意味が切れないよう短く書く。
 */

/** 足りない枠の数。「AIで作成」の結果（◯ / ◯枠）と同じく、勤務パターンごとの不足を足す */
export function countShortSlots(
  dates: readonly string[],
  patternIds: readonly string[],
  required: RequiredByDate,
  counts: CountsByDate
): number {
  let total = 0
  for (const date of dates) {
    for (const patternId of patternIds) {
      const num = requiredAt(required, date, patternId)
      if (num === null) continue
      total += Math.max(0, num - countAt(counts, date, patternId))
    }
  }
  return total
}

/**
 * 埋まらなかった枠の説明。日付ではなく曜日で書く（デモは 1 週間なので曜日で日が決まり、フッターの赤と対応する）。
 * 例: `遅番1枠は、条件に合う人がいません（日）` / `3枠は、条件に合う人がいません（土・日）`
 */
export function describeShortages(
  shortages: readonly DemoShortage[],
  patternName: (patternId: string) => string | undefined
): string {
  const total = shortages.reduce((n, s) => n + s.count, 0)
  const patternIds = new Set(shortages.map((s) => s.patternId))
  const name = patternIds.size === 1 ? (patternName(shortages[0].patternId) ?? '') : ''
  const days = [
    ...new Set([...shortages].sort((a, b) => a.date.localeCompare(b.date)).map((s) => s.date)),
  ]
    .map((date) => WEEKDAY_LABELS[wday(date)])
    .join('・')
  return `${name}${total}枠は、条件に合う人がいません（${days}）`
}
