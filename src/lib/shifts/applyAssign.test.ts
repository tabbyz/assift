import { describe, expect, it } from 'vitest'
import { applyAssign } from './applyAssign'
import { cellKey, toShiftMap, type ShiftCell } from './key'

const STAFF = 'staff-1'
const OTHER_STAFF = 'staff-2'
const EARLY = 'ptn-early'
const NIGHT = 'ptn-night'
const AFTER = 'ptn-after'

/** 夜勤 → 明け のペアだけを持つ店舗 */
const pairOf = (patternId: string) => (patternId === NIGHT ? AFTER : null)

const cell = (date: string, patternId: string, fixed = false): ShiftCell => ({
  staffId: STAFF,
  date,
  patternId,
  fixed,
})

/** 読みやすさのため `date:patternId(fixed)` の配列で見る */
const show = (map: Map<string, ShiftCell>) =>
  [...map.values()]
    .sort((a, b) => (a.staffId + a.date).localeCompare(b.staffId + b.date))
    .map((c) => `${c.staffId}/${c.date}:${c.patternId}${c.fixed ? '(確定)' : ''}`)

// pgTAP（007 §5.2）と同じ並び
describe('applyAssign', () => {
  it('1. 空のセルにアサインする', () => {
    const next = applyAssign(toShiftMap([]), pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: EARLY,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-early'])
  })

  it('2. ペアを持つパターンは翌日に入り、fixed も引き継ぐ', () => {
    const next = applyAssign(toShiftMap([]), pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: NIGHT,
      fixed: true,
    })
    expect(show(next)).toEqual([
      'staff-1/2026-09-17:ptn-night(確定)',
      'staff-1/2026-09-18:ptn-after(確定)',
    ])
  })

  it('3. 翌日がペア以外なら、外しても翌日は残る（v1 からの改善）', () => {
    const before = toShiftMap([cell('2026-09-17', NIGHT), cell('2026-09-18', EARLY)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: null,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-18:ptn-early'])
  })

  it('4. 翌日がペアのパターンなら一緒に消える', () => {
    const before = toShiftMap([cell('2026-09-17', NIGHT), cell('2026-09-18', AFTER)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: null,
      fixed: false,
    })
    expect(show(next)).toEqual([])
  })

  // 3 / 4 はどちらも「空」にする経路。非 null で置き換える経路も同じ規則で動くことを固定する
  // （ペアの後片付けの分岐で、SQL と TS の重複がいちばん危ないところ）
  it('4b. ペアを持つパターンを別のパターンで置き換えると、翌日のペアも消える', () => {
    const before = toShiftMap([cell('2026-09-17', NIGHT), cell('2026-09-18', AFTER)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: EARLY,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-early'])
  })

  it('4c. 翌日がペア以外なら、別のパターンで置き換えても翌日は残る', () => {
    const before = toShiftMap([cell('2026-09-17', NIGHT), cell('2026-09-18', EARLY)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: EARLY,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-early', 'staff-1/2026-09-18:ptn-early'])
  })

  it('5. 何も無いセルを外しても何も起きない', () => {
    const before = toShiftMap([cell('2026-09-17', EARLY)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-12-31',
      patternId: null,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-early'])
  })

  it('ペアは翌日に何かあっても上書きする（v1 と同じ）', () => {
    const before = toShiftMap([cell('2026-09-18', EARLY, true)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: NIGHT,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-night', 'staff-1/2026-09-18:ptn-after'])
  })

  it('ペアの連鎖はしない（明けのさらに翌日は触らない）', () => {
    const next = applyAssign(
      toShiftMap([]),
      (id) => (id === NIGHT ? AFTER : id === AFTER ? EARLY : null),
      {
        staffId: STAFF,
        date: '2026-09-17',
        patternId: NIGHT,
        fixed: false,
      }
    )
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-night', 'staff-1/2026-09-18:ptn-after'])
  })

  it('下書き → 確定は同じパターンで入れ替える', () => {
    const before = toShiftMap([cell('2026-09-17', EARLY, false)])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: EARLY,
      fixed: true,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-17:ptn-early(確定)'])
  })

  it('他のスタッフのセルは触らない', () => {
    const before = toShiftMap([
      cell('2026-09-17', NIGHT),
      cell('2026-09-18', AFTER),
      { staffId: OTHER_STAFF, date: '2026-09-17', patternId: NIGHT, fixed: false },
      { staffId: OTHER_STAFF, date: '2026-09-18', patternId: AFTER, fixed: false },
    ])
    const next = applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: null,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-2/2026-09-17:ptn-night', 'staff-2/2026-09-18:ptn-after'])
  })

  it('元の Map を書き換えない', () => {
    const before = toShiftMap([cell('2026-09-17', EARLY)])
    applyAssign(before, pairOf, {
      staffId: STAFF,
      date: '2026-09-17',
      patternId: NIGHT,
      fixed: false,
    })
    expect(before.get(cellKey(STAFF, '2026-09-17'))?.patternId).toBe(EARLY)
    expect(before.size).toBe(1)
  })

  it('月をまたぐペアも翌日に入る', () => {
    const next = applyAssign(toShiftMap([]), pairOf, {
      staffId: STAFF,
      date: '2026-09-30',
      patternId: NIGHT,
      fixed: false,
    })
    expect(show(next)).toEqual(['staff-1/2026-09-30:ptn-night', 'staff-1/2026-10-01:ptn-after'])
  })
})
