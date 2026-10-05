import { describe, expect, it } from 'vitest'
import { patternInputSchema } from '@/lib/validation/patterns'
import {
  FALLBACK_COLOR,
  INDUSTRIES,
  industryExample,
  nextUnusedColor,
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
    expect(templateState('food').pair).toBeNull()
    expect(templateState('retail').pair).toBeNull()
  })

  it('ボタンに添える中身は働く日の勤務を 3 つまで', () => {
    expect(industryExample('food')).toBe('早番・遅番・通し など')
    expect(industryExample('other')).toBe('日勤 など')
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
