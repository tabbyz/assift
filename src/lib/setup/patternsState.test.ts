import { describe, expect, it } from 'vitest'
import {
  fromSavedPatterns,
  isPairAvailable,
  resumeStep,
  type SavedPattern,
  selectedPatterns,
  toRpcPatterns,
} from './patternsState'
import { templateState } from './templates'

const off = (state: ReturnType<typeof templateState>, key: string) => ({
  ...state,
  rows: state.rows.map((row) => (row.key === key ? { ...row, on: false } : row)),
})

/** RPC に送った形を、DB に保存された形に写す（往復のテスト用） */
const saved = (state: ReturnType<typeof templateState>): SavedPattern[] => {
  let n = 0
  return toRpcPatterns(selectedPatterns(state), () => `id-${++n}`).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description === '' ? null : row.description,
    color_hex: row.color_hex,
    kind: row.kind,
    pair_pattern_id: row.pair_id,
  }))
}

describe('selectedPatterns', () => {
  it('チェックの外れた行と名前が空の行を落とす', () => {
    const state = off(templateState('food'), 'late')
    state.rows.push({
      key: 'x',
      name: '  ',
      description: '',
      colorHex: '#E91E63',
      kind: 'workday',
      on: true,
    })
    expect(selectedPatterns(state).patterns.map((row) => row.name)).toEqual([
      '早番',
      '通し',
      '公休',
      '有給',
    ])
  })

  it('名前と説明の前後の空白を落とす', () => {
    const state = templateState('other')
    state.rows[0] = { ...state.rows[0], name: ' 日勤 ', description: ' 9-18時 ' }
    expect(selectedPatterns(state).patterns[0]).toMatchObject({
      name: '日勤',
      description: '9-18時',
    })
  })

  it('ペアは両方残っていて、スイッチがオンのときだけ', () => {
    expect(selectedPatterns(templateState('care')).pair).toEqual({
      fromKey: 'night',
      toKey: 'after',
    })
    expect(selectedPatterns({ ...templateState('care'), pairEnabled: false }).pair).toBeNull()
    expect(selectedPatterns(off(templateState('care'), 'after')).pair).toBeNull()
  })
})

describe('isPairAvailable', () => {
  it('明けを外すとスイッチを出さない', () => {
    expect(isPairAvailable(templateState('care'))).toBe(true)
    expect(isPairAvailable(off(templateState('care'), 'after'))).toBe(false)
    expect(isPairAvailable(templateState('food'))).toBe(false)
  })
})

describe('toRpcPatterns', () => {
  it('振った id でペアを書く', () => {
    let n = 0
    const rows = toRpcPatterns(selectedPatterns(templateState('care')), () => `id-${++n}`)
    const night = rows.find((row) => row.name === '夜勤')!
    const after = rows.find((row) => row.name === '明け')!
    expect(night.pair_id).toBe(after.id)
    expect(rows.filter((row) => row.pair_id !== null)).toHaveLength(1)
  })
})

describe('fromSavedPatterns', () => {
  it('保存した形から戻すと同じ行とペアになる（往復）', () => {
    const state = fromSavedPatterns(saved(templateState('care')))
    expect(state.rows.map((row) => row.name)).toEqual(
      templateState('care').rows.map((row) => row.name)
    )
    expect(state.rows.every((row) => row.on)).toBe(true)
    expect(state.pairEnabled).toBe(true)
    expect(isPairAvailable(state)).toBe(true)
  })

  it('夜勤の名前を変えても、ペアは pair_pattern_id で戻る', () => {
    const renamed = saved(templateState('care')).map((row) =>
      row.name === '夜勤' ? { ...row, name: '夜' } : row
    )
    const state = fromSavedPatterns(renamed)
    const name = (key: string) => state.rows.find((row) => row.key === key)?.name
    expect(state.pair && [name(state.pair.fromKey), name(state.pair.toKey)]).toEqual(['夜', '明け'])
    expect(state.pairEnabled).toBe(true)
  })

  it('ペアが無く「夜勤」「明け」があれば、スイッチはオフで出す', () => {
    const state = fromSavedPatterns(saved({ ...templateState('care'), pairEnabled: false }))
    expect(state.pair).not.toBeNull()
    expect(state.pairEnabled).toBe(false)
  })

  it('どちらかが無ければスイッチを出さない', () => {
    expect(fromSavedPatterns(saved(templateState('retail'))).pair).toBeNull()
  })

  it('空の説明は空文字に戻す', () => {
    const state = fromSavedPatterns(saved(templateState('other')))
    expect(state.rows.find((row) => row.name === '公休')?.description).toBe('')
  })
})

describe('resumeStep', () => {
  it('勤務が 0 件なら 2、あれば 3', () => {
    expect(resumeStep(0)).toBe(2)
    expect(resumeStep(1)).toBe(3)
  })
})
