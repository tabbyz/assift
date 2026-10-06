import { describe, expect, it } from 'vitest'
import {
  columnTotal,
  fillForward,
  isUniform,
  setCell,
  setUniform,
  toMatrix,
  toSavePayload,
  uniformValue,
} from './requiredNumsMatrix'

const LUNCH = 'ptn-lunch'
const DINNER = 'ptn-dinner'

describe('toMatrix', () => {
  it('勤務ごとの既定値をそのまま持つ', () => {
    expect(
      toMatrix([
        { id: LUNCH, defaultRequiredNums: { '0': 2, holiday: 3 } },
        { id: DINNER, defaultRequiredNums: {} },
      ])
    ).toEqual({ [LUNCH]: { '0': 2, holiday: 3 }, [DINNER]: {} })
  })
})

describe('setCell', () => {
  it('空欄はキーごと消す（まだ決めていない）', () => {
    const matrix = { [LUNCH]: { '0': 2, '1': 1 } }
    expect(setCell(matrix, LUNCH, '0', '')).toEqual({ [LUNCH]: { '1': 1 } })
  })

  it('0 はキーを残す（0 人）', () => {
    expect(setCell({ [LUNCH]: {} }, LUNCH, '0', 0)).toEqual({ [LUNCH]: { '0': 0 } })
  })

  it('他の勤務は触らない', () => {
    const matrix = { [LUNCH]: { '0': 2 }, [DINNER]: { '0': 1 } }
    expect(setCell(matrix, LUNCH, '1', 3)[DINNER]).toEqual({ '0': 1 })
  })
})

describe('fillForward', () => {
  it('その曜日の人数を右の曜日へ（すべての勤務で）', () => {
    const matrix = { [LUNCH]: { '4': 2 }, [DINNER]: { '4': 1, '6': 9 } }
    const next = fillForward(matrix, '4')
    expect(next[LUNCH]).toEqual({ '4': 2, '5': 2, '6': 2, holiday: 2 })
    expect(next[DINNER]).toEqual({ '4': 1, '5': 1, '6': 1, holiday: 1 })
  })

  it('空欄なら右も空欄にする', () => {
    const next = fillForward({ [LUNCH]: { '5': 2, '6': 3 } }, '4')
    expect(next[LUNCH]).toEqual({})
  })

  it('祝（末尾）は右が無いので変えない', () => {
    const matrix = { [LUNCH]: { holiday: 3 } }
    expect(fillForward(matrix, 'holiday')).toBe(matrix)
  })
})

describe('columnTotal', () => {
  it('その曜日の縦の合計。全部空欄なら null', () => {
    const matrix = { [LUNCH]: { '0': 2 }, [DINNER]: { '0': 3, '1': 1 } }
    expect(columnTotal(matrix, '0')).toBe(5)
    expect(columnTotal(matrix, '1')).toBe(1)
    expect(columnTotal(matrix, '2')).toBeNull()
  })

  it('0 だけでも合計は 0（null にしない）', () => {
    expect(columnTotal({ [LUNCH]: { '0': 0 } }, '0')).toBe(0)
  })
})

describe('isUniform', () => {
  it('どの勤務も全曜日同じなら true', () => {
    const same = { '0': 2, '1': 2, '2': 2, '3': 2, '4': 2, '5': 2, '6': 2, holiday: 2 } as const
    expect(isUniform({ [LUNCH]: { ...same }, [DINNER]: {} })).toBe(true)
  })

  it('全部空でも true（初回の店）', () => {
    expect(isUniform({ [LUNCH]: {}, [DINNER]: {} })).toBe(true)
  })

  it('曜日差が 1 つでもあれば false', () => {
    expect(isUniform({ [LUNCH]: { '0': 3, '1': 2 } })).toBe(false)
  })

  it('一部の曜日だけ入っているのも曜日差（false）', () => {
    expect(isUniform({ [LUNCH]: { '0': 2 } })).toBe(false)
  })
})

describe('uniformValue / setUniform', () => {
  it('全曜日に同じ値を入れる', () => {
    const next = setUniform({ [LUNCH]: {} }, LUNCH, 2)
    expect(next[LUNCH]).toEqual({
      '0': 2,
      '1': 2,
      '2': 2,
      '3': 2,
      '4': 2,
      '5': 2,
      '6': 2,
      holiday: 2,
    })
    expect(uniformValue(next, LUNCH)).toBe(2)
  })

  it('空欄なら全部消す', () => {
    const filled = setUniform({ [LUNCH]: {} }, LUNCH, 2)
    expect(setUniform(filled, LUNCH, '')[LUNCH]).toEqual({})
    expect(uniformValue({ [LUNCH]: {} }, LUNCH)).toBe('')
  })

  it('0 も全曜日に入る（0 人）', () => {
    expect(uniformValue(setUniform({ [LUNCH]: {} }, LUNCH, 0), LUNCH)).toBe(0)
  })
})

describe('toSavePayload', () => {
  it('空欄はキーを持たない。0 は残る', () => {
    expect(toSavePayload({ [LUNCH]: { '0': 0, '1': '' }, [DINNER]: {} })).toEqual({
      [LUNCH]: { '0': 0 },
      [DINNER]: {},
    })
  })
})
