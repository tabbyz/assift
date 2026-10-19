import type { PatternKind } from '@/lib/patterns/kinds'

/**
 * 初期設定の業種とテンプレート（014 §5.3・034 §2-6・§2-7）。テンプレートの値は 034 で v1 の実データから決めた。
 *
 * 業種は店舗の分析にも使うので 9 つに分け、テンプレートは 6 つのまま業種ごとに当てるものを決める（`TEMPLATE_OF`）。
 * 業種の値は `tenants.industry` の check と同じ（`templates.test.ts` が `tenants.sql` を読んで確かめる）。
 *
 * 時間は説明欄（10 文字まで）に入れるので、seed と同じ「9-17時」の書き方にする（`17:00〜23:00` は 11 文字で入らない）。
 * 色は `PATTERN_COLORS` の中から、同じテンプレートの中で重ならないように選ぶ。必要人数は持たない（初回では聞かない。014 §3.4）。
 */

export const INDUSTRIES = [
  'food',
  'retail',
  'beauty',
  'care',
  'clinic',
  'nursery',
  'logistics',
  'office',
  'other',
] as const
export type Industry = (typeof INDUSTRIES)[number]

export const INDUSTRY_LABELS: Record<Industry, string> = {
  food: '飲食店',
  retail: '小売・販売',
  beauty: '美容・サロン',
  care: '介護・福祉',
  clinic: 'クリニック・歯科',
  nursery: '保育・教育',
  logistics: '物流・工場',
  office: '事務所・コールセンター',
  other: 'その他',
}

/**
 * ボタンに添える店の例。勤務の例にすると、同じテンプレートを当てる業種で添え書きが重なる（034 §2-6）。
 * 選ぶときに要るのは「自分はどれか」で、勤務は選んだ直後の画面で見える
 */
const INDUSTRY_EXAMPLES: Record<Industry, string> = {
  food: 'カフェ・居酒屋・レストラン',
  retail: 'スーパー・コンビニ・雑貨',
  beauty: '美容室・ネイル・エステ',
  care: '施設・デイサービス・訪問',
  clinic: '医院・歯科・薬局',
  nursery: '保育園・学童・塾',
  logistics: '倉庫・工場・配送',
  office: '事務・受付・コールセンター',
  other: '上にないお店',
}

/** DB から読んだ値（`string | null`）を業種に絞る。一覧に無い値は null として扱う */
export function isIndustry(value: unknown): value is Industry {
  return typeof value === 'string' && (INDUSTRIES as readonly string[]).includes(value)
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

/**
 * どのテンプレートにもあるお休み（034 §2-7）。先頭の「休み」は完成イメージの見本にも使う。
 * 希望休は休みと見分けられる色にする（赤は早番の `#FF5722` と並ぶと見分けにくいのでピンク）
 */
const DAYOFF_ROWS: TemplateRow[] = [
  { key: 'dayoff', name: '休み', description: '', colorHex: '#FFFFFF', kind: 'dayoff' },
  { key: 'request', name: '希望休', description: '', colorHex: '#E91E63', kind: 'dayoff' },
  { key: 'paid', name: '有給', description: '', colorHex: '#4CAF50', kind: 'dayoff' },
]

const work = (key: string, name: string, description: string, colorHex: string): TemplateRow => ({
  key,
  name,
  description,
  colorHex,
  kind: 'workday',
})

export const TEMPLATE_KEYS = ['food', 'shifts3', 'care', 'clinic', 'nursery', 'general'] as const
type TemplateKey = (typeof TEMPLATE_KEYS)[number]

const TEMPLATES: Record<TemplateKey, Template> = {
  food: {
    rows: [
      work('early', '早番', '10-16時', '#FF5722'),
      work('late', '遅番', '17-22時', '#3F51B5'),
      work('full', '通し', '10-22時', '#009688'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
  // 早番・中番・遅番（小売・美容・物流）
  shifts3: {
    rows: [
      work('early', '早番', '9-18時', '#FF5722'),
      work('middle', '中番', '10-19時', '#FFC107'),
      work('late', '遅番', '12-21時', '#3F51B5'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
  care: {
    rows: [
      work('day', '日勤', '9-18時', '#FFC107'),
      work('early', '早番', '7-16時', '#FF5722'),
      work('late', '遅番', '11-20時', '#3F51B5'),
      work('night', '夜勤', '16-9時', '#607D8B'),
      ...DAYOFF_ROWS,
      // お休みの最後に置く（完成イメージの見本は先頭のお休みを使うので、明けを先頭にしない。034 §4.4）
      {
        key: 'after',
        name: '明け',
        description: '夜勤の次の日',
        colorHex: '#9E9E9E',
        kind: 'dayoff',
      },
    ],
    pair: { fromKey: 'night', toKey: 'after' },
  },
  clinic: {
    rows: [
      work('day', '日勤', '9-18時', '#FFC107'),
      work('am', '午前', '9-13時', '#03A9F4'),
      work('pm', '午後', '14-18時', '#009688'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
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
  // その他・事務所。業種を問わず最も合う組み合わせ（034 §5.2 の r5）
  general: {
    rows: [
      work('day', '日勤', '9-18時', '#FFC107'),
      work('early', '早番', '8-17時', '#FF5722'),
      work('late', '遅番', '11-20時', '#3F51B5'),
      ...DAYOFF_ROWS,
    ],
    pair: null,
  },
}

/** 業種ごとに当てるテンプレート（034 §2-6） */
export const TEMPLATE_OF: Record<Industry, TemplateKey> = {
  food: 'food',
  retail: 'shifts3',
  beauty: 'shifts3',
  care: 'care',
  clinic: 'clinic',
  nursery: 'nursery',
  logistics: 'shifts3',
  office: 'general',
  other: 'general',
}

/** 業種を選んだ直後の状態。全行にチェックが付き、ペアのスイッチはオン */
export function templateState(industry: Industry): SetupPatternsState {
  const template = TEMPLATES[TEMPLATE_OF[industry]]
  return {
    rows: template.rows.map((row) => ({ ...row, on: true })),
    pair: template.pair,
    pairEnabled: template.pair !== null,
  }
}

/** ボタンに添える店の例（「カフェ・居酒屋・レストラン」） */
export function industryExample(industry: Industry): string {
  return INDUSTRY_EXAMPLES[industry]
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
