import { wday } from '@/lib/calendar/dateString'
import { PATTERN_COLORS, type PatternColorHex } from '@/lib/patterns/colors'
import type { PatternKind } from '@/lib/patterns/kinds'
import { cellKey, type ShiftCell, type ShiftMap } from '@/lib/shifts/key'
import type { RequiredByDate } from '@/lib/shifts/requiredNums'

/**
 * LP の触れるデモの店（016 §3.3）。DB には触らない。ページの中だけの架空のデータ。
 *
 * 曜日の並びは月〜日（`dates` の 0 番目が月曜）。祝日は呼び出し側（Server）が渡す。
 */

type PatternColorName = (typeof PATTERN_COLORS)[number]['name']

function colorOf(name: PatternColorName): PatternColorHex {
  const color = PATTERN_COLORS.find((c) => c.name === name)
  if (!color) throw new Error(`unknown pattern color: ${name}`)
  return color.hex
}

export type DemoPattern = {
  id: string
  name: string
  description: string
  colorHex: PatternColorHex
  kind: PatternKind
}

/** 飲食店のひな形（014 の業種テンプレート）から通しを外したもの */
export const DEMO_PATTERNS: DemoPattern[] = [
  {
    id: 'early',
    name: '早番',
    description: '9-17時',
    colorHex: colorOf('Deep Orange'),
    kind: 'workday',
  },
  {
    id: 'late',
    name: '遅番',
    description: '17-23時',
    colorHex: colorOf('Indigo'),
    kind: 'workday',
  },
  { id: 'off', name: '公休', description: '', colorHex: colorOf('White'), kind: 'dayoff' },
  { id: 'paid', name: '有給', description: '', colorHex: colorOf('Green'), kind: 'dayoff' },
]

export const DEMO_STORE_NAME = 'カフェ 青葉台店'

export type DemoStaff = {
  id: string
  name: string
  /** 勤務できる曜日（0 = 日曜）。アプリの `availableWdays` と同じ */
  availableWdays: number[]
  /** 週に入れる日数の上限 */
  maxPerWeek: number
}

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]
const except = (...days: number[]) => EVERY_DAY.filter((d) => !days.includes(d))

export const DEMO_STAFFS: DemoStaff[] = [
  { id: 'sato', name: '佐藤', availableWdays: EVERY_DAY, maxPerWeek: 5 },
  { id: 'suzuki', name: '鈴木', availableWdays: except(2, 4), maxPerWeek: 5 },
  { id: 'takahashi', name: '高橋', availableWdays: except(1, 3), maxPerWeek: 5 },
  { id: 'tanaka', name: '田中', availableWdays: EVERY_DAY, maxPerWeek: 5 },
  { id: 'ito', name: '伊藤', availableWdays: except(0, 1, 6), maxPerWeek: 4 },
  { id: 'watanabe', name: '渡辺', availableWdays: except(0, 5), maxPerWeek: 5 },
  { id: 'yamamoto', name: '山本', availableWdays: EVERY_DAY, maxPerWeek: 3 },
]

/** デモの AI が守る条件（012 のハード制約のうち、LP で説明しているもの） */
export const DEMO_RULES = {
  /** 割り当てる順 */
  patternIds: ['early', 'late'],
  /** 遅番の翌日に早番を入れない */
  rest: { after: 'late', before: 'early' },
  /** これを超えて続けて入れない */
  maxConsecutive: 4,
} as const

/** 最初に入っているシフト。[スタッフ, 月曜からの日数, パターン, 確定] */
const INITIAL: [string, number, string, boolean][] = [
  ['sato', 0, 'early', true],
  ['sato', 1, 'early', true],
  ['sato', 2, 'off', true],
  ['sato', 3, 'late', true],
  ['sato', 4, 'late', true],
  ['sato', 5, 'early', true],
  ['sato', 6, 'off', true],
  ['suzuki', 0, 'late', false],
  ['suzuki', 2, 'early', false],
  ['suzuki', 4, 'early', false],
  ['suzuki', 5, 'late', false],
  ['takahashi', 1, 'late', false],
  ['takahashi', 3, 'early', false],
  ['tanaka', 2, 'paid', true],
]

export function demoInitialShifts(dates: string[]): ShiftMap {
  const shifts: ShiftMap = new Map()
  for (const [staffId, index, patternId, fixed] of INITIAL) {
    const date = dates[index]
    if (!date) continue
    const cell: ShiftCell = { staffId, date, patternId, fixed }
    shifts.set(cellKey(staffId, date), cell)
  }
  return shifts
}

/** 土日祝は遅番を 1 人多く置く */
function isBusyDay(date: string, holidays: ReadonlySet<string>): boolean {
  const day = wday(date)
  return day === 0 || day === 6 || holidays.has(date)
}

/** 必要人数。早番 2 人、遅番 2 人（土日祝は 3 人） */
export function demoRequired(dates: string[], holidays: ReadonlySet<string>): RequiredByDate {
  const required: RequiredByDate = new Map()
  for (const date of dates) {
    required.set(
      date,
      new Map([
        ['early', 2],
        ['late', isBusyDay(date, holidays) ? 3 : 2],
      ])
    )
  }
  return required
}

/** 日付のメモ（木曜だけ） */
export function demoNotes(dates: string[]): Map<string, string> {
  const thursday = dates[3]
  return thursday ? new Map([[thursday, '棚卸']]) : new Map()
}
