import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { patternInputSchema } from '@/lib/validation/patterns'
import {
  FALLBACK_COLOR,
  INDUSTRIES,
  INDUSTRY_LABELS,
  industryExample,
  isIndustry,
  nextUnusedColor,
  TEMPLATE_KEYS,
  TEMPLATE_OF,
  templateState,
} from './templates'

describe('templateState', () => {
  it.each(INDUSTRIES)(
    '%s: 全行が勤務パターンの入力として通る（名前 6 文字・説明 10 文字の上限）',
    (industry) => {
      for (const row of templateState(industry).rows) {
        const result = patternInputSchema.safeParse({
          name: row.name,
          description: row.description,
          colorHex: row.colorHex,
          kind: row.kind,
          pairPatternId: null,
          defaultRequiredNums: {},
        })
        expect(result.success, `${row.name}（${row.description}）`).toBe(true)
      }
    }
  )

  it.each(INDUSTRIES)('%s: 色が業種の中で重ならない', (industry) => {
    const colors = templateState(industry).rows.map((row) => row.colorHex)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it.each(INDUSTRIES)('%s: key が重ならず、働く日が 1 つ以上ある', (industry) => {
    const { rows } = templateState(industry)
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length)
    expect(rows.some((row) => row.kind === 'workday')).toBe(true)
  })

  it('全行にチェックが付いた状態で始まる', () => {
    expect(templateState('food').rows.every((row) => row.on)).toBe(true)
  })

  it('介護だけが夜勤 → 明けのペアを持ち、スイッチはオン', () => {
    const care = templateState('care')
    const name = (key: string) => care.rows.find((row) => row.key === key)?.name
    expect(care.pair && [name(care.pair.fromKey), name(care.pair.toKey)]).toEqual(['夜勤', '明け'])
    expect(care.pairEnabled).toBe(true)
    for (const industry of INDUSTRIES.filter((value) => value !== 'care')) {
      expect(templateState(industry).pair, industry).toBeNull()
    }
  })

  it.each(INDUSTRIES)(
    '%s: お休みの先頭 3 つが 休み・希望休・有給（先頭は完成イメージの見本）。介護だけ 4 つ目に明け',
    (industry) => {
      const dayoffs = templateState(industry)
        .rows.filter((row) => row.kind === 'dayoff')
        .map((row) => row.name)
      expect(dayoffs).toEqual(
        industry === 'care' ? ['休み', '希望休', '有給', '明け'] : ['休み', '希望休', '有給']
      )
    }
  )

  it('業種ごとに当てるテンプレートが決まっていて、6 つのテンプレートがどれも使われている', () => {
    expect(Object.keys(TEMPLATE_OF).sort()).toEqual([...INDUSTRIES].sort())
    expect(new Set(Object.values(TEMPLATE_OF))).toEqual(new Set(TEMPLATE_KEYS))
  })
})

describe('業種', () => {
  it('添え書きは業種ごとに書き、重ならない', () => {
    const examples = INDUSTRIES.map(industryExample)
    expect(new Set(examples).size).toBe(INDUSTRIES.length)
    expect(industryExample('food')).toBe('カフェ・居酒屋・レストラン')
  })

  it('ラベルが重ならない', () => {
    const labels = INDUSTRIES.map((industry) => INDUSTRY_LABELS[industry])
    expect(new Set(labels).size).toBe(INDUSTRIES.length)
  })

  it('isIndustry は一覧の値だけを通す', () => {
    expect(isIndustry('care')).toBe(true)
    expect(isIndustry('medical')).toBe(false)
    expect(isIndustry('constructor')).toBe(false)
    expect(isIndustry(null)).toBe(false)
  })

  it('tenants.industry の check の値が INDUSTRIES と同じ（TS にだけ足すと保存が 23514 で止まる）', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/schemas/public/tables/tenants.sql'),
      'utf8'
    )
    const check = sql.match(/industry\s+text check \(industry in \(([^)]*)\)\)/)
    expect(check, 'tenants.sql に industry の check が見つからない').not.toBeNull()
    const values = [...check![1].matchAll(/'([^']+)'/g)].map((m) => m[1])
    expect(values).toEqual([...INDUSTRIES])
  })
})

describe('nextUnusedColor', () => {
  it('使っている色を飛ばす（大文字・小文字は区別しない）', () => {
    expect(nextUnusedColor(['#ff5722'], 'workday')).toBe('#FFC107')
  })

  it('お休みは淡い色から', () => {
    expect(nextUnusedColor([], 'dayoff')).toBe('#FFFFFF')
    expect(nextUnusedColor(['#FFFFFF', '#4CAF50'], 'dayoff')).toBe('#CDDC39')
  })

  it('使い切ったら灰色', () => {
    expect(nextUnusedColor(['#FFFFFF', '#4CAF50', '#CDDC39', '#FFEB3B'], 'dayoff')).toBe(
      FALLBACK_COLOR
    )
  })
})
