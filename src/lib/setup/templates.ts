import type { PatternKind } from '@/lib/patterns/kinds'

/**
 * 初期設定の業種テンプレート（014 §5.3）。値は仮のもので、v1 の実データを見て決めたものではない。
 *
 * 時間は説明欄（10 文字まで）に入れるので、seed と同じ「9-17時」の書き方にする（`17:00〜23:00` は 11 文字で入らない）。
 * 色は `PATTERN_COLORS` の中から、同じ業種の中で重ならないように選ぶ。必要人数は持たない（初回では聞かない。014 §3.4）。
 */

export const INDUSTRIES = ['food', 'retail', 'care', 'nursery', 'other'] as const
export type Industry = (typeof INDUSTRIES)[number]

export const INDUSTRY_LABELS: Record<Industry, string> = {
  food: '飲食店',
  retail: '小売・コンビニ',
  care: '介護・医療',
  nursery: '保育・教育',
  other: 'その他',
}

/** 画面の 1 行。`key` は画面の中だけの識別子（保存すると DB の id に変わる） */
export type SetupPatternRow = {
  key: string
  name: string
  description: string
  colorHex: string
  kind: PatternKind
  /** チェックが付いているか。外した行は保存しない */
  on: boolean
}

/** 「夜勤の次の日を明けに」のペア（`from` の翌日に `to` が入る） */
export type SetupPair = { fromKey: string; toKey: string }

/** ステップ 2 の画面の状態 */
export type SetupPatternsState = {
  rows: SetupPatternRow[]
  /** テンプレートが持つペア。無い業種・行を消したときは null */
  pair: SetupPair | null
  /** ペアのスイッチ。`pair` があっても、両方の行にチェックが付いていなければ使わない */
  pairEnabled: boolean
}

type TemplateRow = {
  key: string
  name: string
  description: string
  colorHex: string
  kind: PatternKind
}
type Template = { rows: TemplateRow[]; pair: SetupPair | null }

const DAYOFF_ROWS: TemplateRow[] = [
  { key: 'dayoff', name: '公休', description: '', colorHex: '#FFFFFF', kind: 'dayoff' },
  { key: 'paid', name: '有給', description: '', colorHex: '#4CAF50', kind: 'dayoff' },
]

const work = (key: string, name: string, description: string, colorHex: string): TemplateRow => ({
  key,
  name,
  description,
  colorHex,
  kind: 'workday',
})

const TEMPLATES: Record<Industry, Template> = {
  food: {
    rows: [
      work('early', '早番', '9-17時', '#FF5722'),
      work('late', '遅番', '17-23時', '#3F51B5'),
      work('full', '通し', '10-22時', '#009688'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
  retail: {
    rows: [
      work('morning', '朝', '6-9時', '#FFEB3B'),
      work('day', '日中', '9-17時', '#03A9F4'),
      work('evening', '夕方', '17-22時', '#9C27B0'),
      work('night', '夜勤', '22-6時', '#607D8B'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
  care: {
    rows: [
      work('early', '早番', '7-16時', '#FF5722'),
      work('day', '日勤', '9-18時', '#FFC107'),
      work('late', '遅番', '11-20時', '#3F51B5'),
      work('night', '夜勤', '16-9時', '#607D8B'),
      {
        key: 'after',
        name: '明け',
        description: '夜勤の次の日',
        colorHex: '#9E9E9E',
        kind: 'dayoff',
      },
      ...DAYOFF_ROWS,
    ],
    pair: { fromKey: 'night', toKey: 'after' },
  },
  nursery: {
    rows: [
      work('early', '早番', '7-16時', '#FF5722'),
      work('middle', '中番', '8時半-17時半', '#03A9F4'),
      work('late', '遅番', '10-19時', '#3F51B5'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
  other: {
    rows: [work('day', '日勤', '9-18時', '#FFC107'), ...DAYOFF_ROWS],
    pair: null,
  },
}

/** 業種を選んだ直後の状態。全行にチェックが付き、ペアのスイッチはオン */
export function templateState(industry: Industry): SetupPatternsState {
  const template = TEMPLATES[industry]
  return {
    rows: template.rows.map((row) => ({ ...row, on: true })),
    pair: template.pair,
    pairEnabled: template.pair !== null,
  }
}

/** ボタンに添える中身（「早番・遅番 など」） */
export function industryExample(industry: Industry): string {
  const names = TEMPLATES[industry].rows
    .filter((row) => row.kind === 'workday')
    .map((row) => row.name)
  return `${names.slice(0, 3).join('・')} など`
}

/** 足した勤務に割り当てる色の順。働く日は暖色 → 寒色、お休みは淡い色から */
const WORKDAY_COLOR_ORDER = [
  '#FF5722',
  '#FFC107',
  '#3F51B5',
  '#009688',
  '#03A9F4',
  '#9C27B0',
  '#E91E63',
  '#FF9800',
  '#8BC34A',
  '#00BCD4',
  '#673AB7',
  '#795548',
  '#607D8B',
] as const
const DAYOFF_COLOR_ORDER = ['#FFFFFF', '#4CAF50', '#CDDC39', '#FFEB3B'] as const
/** 使い切ったとき */
export const FALLBACK_COLOR = '#9E9E9E'

/** 使っていない色を 1 つ返す。大文字・小文字は区別しない */
export function nextUnusedColor(used: readonly string[], kind: PatternKind): string {
  const taken = new Set(used.map((hex) => hex.toUpperCase()))
  const order = kind === 'workday' ? WORKDAY_COLOR_ORDER : DAYOFF_COLOR_ORDER
  return order.find((hex) => !taken.has(hex)) ?? FALLBACK_COLOR
}
