import type { DirectiveType } from '@/lib/assist/directives'

/**
 * 指示の例文 20 本（012 §3.3）。small の fixture（青木・岩本・川田・玉井・長澤・平岡・松田・水上）に対して解釈させ、
 * 期待する条件の型・人・ハード / ソフトが出るかを数える。`none` は「条件にしない」が正解の文。
 */
export type InstructionCase = {
  text: string
  /** `type` を配列にすると、どれかに当たれば正解（言い方に日数が無い「少なめ」など、読みが 2 通りあるもの） */
  expect:
    | { type: DirectiveType | DirectiveType[]; staff?: string; staffB?: string; hard?: boolean }[]
    | 'none'
}

export const INSTRUCTION_CASES: InstructionCase[] = [
  {
    text: '青木さんは土日に多めに入れてください',
    expect: [{ type: 'prefer_work', staff: '青木', hard: false }],
  },
  {
    text: '岩本さんは月曜日は必ず休みにしてください',
    expect: [{ type: 'prefer_off', staff: '岩本', hard: true }],
  },
  {
    text: '新人の川田さんは必ず玉井さんと同じ日に入れる',
    expect: [{ type: 'same_days', staff: '川田', staffB: '玉井', hard: true }],
  },
  {
    text: '長澤さんと平岡さんは同じ日にしないで',
    expect: [{ type: 'different_days', staff: '長澤', staffB: '平岡', hard: true }],
  },
  { text: '松田さんは週3日までにしてあげて', expect: [{ type: 'limit_workdays', staff: '松田' }] },
  {
    text: '水上さんには今月15日以上は入ってほしい',
    expect: [{ type: 'min_workdays', staff: '水上' }],
  },
  {
    text: '青木さんは早番を優先で',
    expect: [{ type: 'prefer_pattern', staff: '青木', hard: false }],
  },
  {
    text: '岩本さんは遅番には入れないでください',
    expect: [{ type: 'avoid_pattern', staff: '岩本', hard: true }],
  },
  { text: '川田さんの土日祝は2日まで', expect: [{ type: 'limit_weekends', staff: '川田' }] },
  { text: '10月3日の早番を優先して埋めて', expect: [{ type: 'fill_first' }] },
  { text: '週末の遅番はできるだけ埋めてほしい', expect: [{ type: 'fill_first' }] },
  { text: '玉井さんは10/12と10/13は休み希望です', expect: [{ type: 'prefer_off', staff: '玉井' }] },
  {
    text: 'なるべく長澤さんを平日の日勤に',
    expect: [{ type: 'prefer_pattern', staff: '長澤', hard: false }],
  },
  { text: '平岡くんは夜勤NG', expect: [{ type: 'avoid_pattern', staff: '平岡', hard: true }] },
  {
    text: '松田さんは土日多め、水上さんは土日少なめで',
    expect: [
      { type: 'prefer_work', staff: '松田' },
      // 日数が無いので「土日祝は n 日まで」とも「土日は休み寄り（ソフト）」とも読める
      { type: ['limit_weekends', 'prefer_off'], staff: '水上' },
    ],
  },
  { text: '元気がない人の負荷を軽くしてあげて', expect: 'none' },
  { text: 'いつもありがとうございます', expect: 'none' },
  { text: '佐藤さんは土日に多め', expect: 'none' },
  {
    text: '青木さんは連勤しすぎないように。週4日まで',
    expect: [{ type: 'limit_workdays', staff: '青木' }],
  },
  {
    text: '岩本さんは水曜は休み、川田さんは水曜に入れて',
    expect: [
      { type: 'prefer_off', staff: '岩本' },
      { type: 'prefer_work', staff: '川田' },
    ],
  },
]
