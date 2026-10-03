import { datesBetween, wday } from '@/lib/calendar/dateString'
import type { RequiredNumRow } from '@/lib/shifts/satisfaction'
import type {
  AssistInput,
  AssistPatternInput,
  AssistRestrictionInput,
  AssistStaffInput,
  ExistingShift,
} from '../problem'
import { contextRange, requiredNumsRange } from '../problem'

/**
 * 固定の問題（012 §6.1 / §6.3）。seed から決定的に作る店舗で、Vitest（`model.solve.test.ts`）と
 * 評価スクリプト（`scripts/assist-eval/`）が同じものを使う。形は seed.sql の店舗（6 パターン・制約 4 種・夜勤 → 明け）に合わせる。
 */

export type FixtureScale = 'small' | 'medium' | 'large'

export const FIXTURE_STAFF_COUNTS: Record<FixtureScale, number> = {
  small: 8,
  medium: 15,
  large: 30,
}

/** mulberry32。Math.random を使わない（同じ seed から同じ店舗） */
function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const FIXTURE_PATTERNS = {
  early: 'p-early',
  day: 'p-day',
  late: 'p-late',
  night: 'p-night',
  after: 'p-after',
  off: 'p-off',
} as const

const PATTERNS: AssistPatternInput[] = [
  { id: FIXTURE_PATTERNS.early, name: '早番', kind: 'workday', pairPatternId: null },
  { id: FIXTURE_PATTERNS.day, name: '日勤', kind: 'workday', pairPatternId: null },
  { id: FIXTURE_PATTERNS.late, name: '遅番', kind: 'workday', pairPatternId: null },
  {
    id: FIXTURE_PATTERNS.night,
    name: '夜勤',
    kind: 'workday',
    pairPatternId: FIXTURE_PATTERNS.after,
  },
  { id: FIXTURE_PATTERNS.after, name: '明け', kind: 'dayoff', pairPatternId: null },
  { id: FIXTURE_PATTERNS.off, name: '休み', kind: 'dayoff', pairPatternId: null },
]

/**
 * 制約の入力を組む（013 で id / staffId / hard / wdays が増えた）。既定は店舗全体・必須（012 までの意味）。
 * id は中身から決める（テストの順序に依らず同じ値になる）
 */
export function restrictionRow(
  row: Pick<AssistRestrictionInput, 'kind'> & Partial<AssistRestrictionInput>
): AssistRestrictionInput {
  const base = {
    days: null,
    pattern1Id: null,
    pattern2Id: null,
    staffId: null,
    hard: true,
    wdays: null,
    ...row,
  }
  return {
    ...base,
    id:
      row.id ??
      [
        'r',
        base.kind,
        base.staffId,
        base.pattern1Id,
        base.pattern2Id,
        base.days,
        base.wdays?.join(''),
      ]
        .map((part) => part ?? '')
        .join(':'),
  }
}

const RESTRICTIONS: AssistRestrictionInput[] = [
  // 遅番の翌日に早番を入れない
  restrictionRow({
    kind: 'deny_pattern_pair',
    days: null,
    pattern1Id: FIXTURE_PATTERNS.late,
    pattern2Id: FIXTURE_PATTERNS.early,
  }),
  // 夜勤は週 1 日まで
  restrictionRow({
    kind: 'max_work_week',
    days: 1,
    pattern1Id: FIXTURE_PATTERNS.night,
    pattern2Id: null,
  }),
  // 勤務日は連続 5 日まで
  restrictionRow({ kind: 'max_work_consecutive', days: 5, pattern1Id: null, pattern2Id: null }),
  restrictionRow({ kind: 'sat_or_sun_dayoff', days: null, pattern1Id: null, pattern2Id: null }),
]

const FAMILY = [
  '青木',
  '岩本',
  '川田',
  '玉井',
  '長澤',
  '平岡',
  '松田',
  '水上',
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡辺',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
  '佐々木',
  '山口',
  '松本',
  '井上',
  '木村',
  '林',
  '清水',
  '山崎',
  '森',
  '池田',
]

export type FixtureOptions = {
  scale: FixtureScale
  seed?: number
  period?: { start: string; end: string }
  /** 必要人数の水準（1 = 在籍の勤務可能日数の 8 割程度） */
  load?: number
  /** スタッフ別の規則（seed.sql の 4 件と同じ形。013 §5.5）を足す */
  staffRules?: boolean
}

/**
 * seed.sql のスタッフ別の規則と同じ 4 件（013 §5.5）。3 人目 = 週 3 日以上（なるべく）・土日祝 2 日まで（必須）、
 * 4 人目 = 水曜なるべく休み、5 人目 = 金曜なるべく休み
 */
function staffRules(staffs: AssistStaffInput[]): AssistRestrictionInput[] {
  const [, , third, fourth, fifth] = staffs
  return [
    restrictionRow({ kind: 'min_work_week', days: 3, staffId: third.id, hard: false }),
    restrictionRow({ kind: 'max_weekend_days', days: 2, staffId: third.id }),
    restrictionRow({ kind: 'prefer_dayoff_wdays', wdays: [3], staffId: fourth.id, hard: false }),
    restrictionRow({ kind: 'prefer_dayoff_wdays', wdays: [5], staffId: fifth.id, hard: false }),
  ]
}

/**
 * seed の店舗に似せた問題を作る。
 * - スタッフ: 約 2 割が平日だけ、上限は 5 / 4 / 3 日、夜勤を選べるのは約 4 割
 * - 必要人数: 平日と土日で水準を変える。着地日（P.end + 1）にも入れる
 * - 既存: 期間の前後と中に「休み」を約 5%、確定の勤務を少し（週上限・連勤が既存から効く状況を作る）
 */
export function fixtureInput(options: FixtureOptions): AssistInput {
  const rand = random(options.seed ?? 1)
  const period = options.period ?? { start: '2026-10-01', end: '2026-10-31' }
  const count = FIXTURE_STAFF_COUNTS[options.scale]
  const load = options.load ?? 1

  const staffs: AssistStaffInput[] = Array.from({ length: count }, (_, index) => {
    const partTime = rand() < 0.2
    const maxWorkWeek = partTime ? 3 : rand() < 0.2 ? 4 : 5
    const night = rand() < 0.4
    const base: string[] = [FIXTURE_PATTERNS.early, FIXTURE_PATTERNS.day, FIXTURE_PATTERNS.late]
    const patternIds = base
      .filter(() => rand() < 0.85)
      .concat(night ? [FIXTURE_PATTERNS.night] : [])
      .concat([FIXTURE_PATTERNS.after, FIXTURE_PATTERNS.off])
    if (!patternIds.includes(FIXTURE_PATTERNS.day)) patternIds.push(FIXTURE_PATTERNS.day)
    return {
      id: `s${String(index + 1).padStart(2, '0')}`,
      name: `${FAMILY[index % FAMILY.length]}${index >= FAMILY.length ? index : ''}`,
      availableWdays: partTime ? [1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6],
      maxWorkWeek,
      patternIds,
      defaults: rand() < 0.3 ? { '1': FIXTURE_PATTERNS.day, '3': FIXTURE_PATTERNS.day } : {},
    }
  })

  // 1 日あたりの勤務可能な延べ人数 ≈ Σ max_work_week / 7
  const perDay = (staffs.reduce((sum, staff) => sum + staff.maxWorkWeek, 0) / 7) * 0.8 * load
  const requiredNums: RequiredNumRow[] = []
  const reqRange = requiredNumsRange(period)
  for (const date of datesBetween(reqRange.start, reqRange.end)) {
    const weekend = wday(date) === 0 || wday(date) === 6
    const total = Math.max(1, Math.round(perDay * (weekend ? 0.8 : 1)))
    const night = Math.max(1, Math.round(total * 0.15))
    const early = Math.round((total - night) * 0.35)
    const late = Math.round((total - night) * 0.3)
    const day = Math.max(0, total - night - early - late)
    requiredNums.push(
      { patternId: FIXTURE_PATTERNS.early, date, num: early },
      { patternId: FIXTURE_PATTERNS.day, date, num: day },
      { patternId: FIXTURE_PATTERNS.late, date, num: late },
      { patternId: FIXTURE_PATTERNS.night, date, num: night }
    )
  }

  const shifts: ExistingShift[] = []
  const context = contextRange(period)
  for (const staff of staffs) {
    for (const date of datesBetween(context.start, context.end)) {
      const roll = rand()
      if (roll < 0.05) shifts.push({ staffId: staff.id, date, patternId: FIXTURE_PATTERNS.off })
      // 期間の外（前後の週）は勤務が入っている想定。週上限・連勤が期間の境目で効く
      else if (
        (date < period.start || date > period.end) &&
        roll < 0.6 &&
        staff.availableWdays.includes(wday(date))
      ) {
        shifts.push({ staffId: staff.id, date, patternId: FIXTURE_PATTERNS.day })
      } else if (roll < 0.07 && staff.availableWdays.includes(wday(date))) {
        shifts.push({ staffId: staff.id, date, patternId: FIXTURE_PATTERNS.early })
      }
    }
  }

  return {
    period,
    startOfWeek: 0,
    holidays: ['2026-10-12'],
    staffs,
    patterns: PATTERNS,
    restrictions: options.staffRules ? [...RESTRICTIONS, ...staffRules(staffs)] : RESTRICTIONS,
    requiredNums,
    shifts,
  }
}

/** 1 日だけの必要人数を足す（テストで枠を作る） */
export function required(patternId: string, dates: string[], num: number): RequiredNumRow[] {
  return dates.map((date) => ({ patternId, date, num }))
}

/** テスト用の最小の入力。指定しない列は「全曜日・上限 5・全パターン選択可・制約なし」 */
export function smallInput(
  overrides: Partial<AssistInput> & { staffCount?: number } = {}
): AssistInput {
  const { staffCount = 3, ...rest } = overrides
  const patterns = rest.patterns ?? PATTERNS
  const staffs: AssistStaffInput[] =
    rest.staffs ??
    Array.from({ length: staffCount }, (_, index) => ({
      id: `s${index + 1}`,
      name: `スタッフ${index + 1}`,
      availableWdays: [0, 1, 2, 3, 4, 5, 6],
      maxWorkWeek: 5,
      patternIds: patterns.map((pattern) => pattern.id),
      defaults: {},
    }))
  return {
    // 2026-10-04 は日曜。1 週間ちょうど（週の始まり = 日曜）
    period: { start: '2026-10-04', end: '2026-10-10' },
    startOfWeek: 0,
    holidays: [],
    restrictions: [],
    requiredNums: [],
    shifts: [],
    ...rest,
    staffs,
    patterns,
  }
}
