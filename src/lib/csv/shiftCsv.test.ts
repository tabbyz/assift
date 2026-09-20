import { describe, expect, it } from 'vitest'
import type { ShiftTable } from '@/lib/shifts/table'
import { csvField, toShiftCsv } from './shiftCsv'

function table(overrides: Partial<ShiftTable> = {}): ShiftTable {
  return {
    tenantName: 'テスト店',
    start: '2026-09-01',
    end: '2026-09-03',
    dates: ['2026-09-01', '2026-09-02', '2026-09-03'],
    holidays: [],
    staffs: [
      { id: 's1', name: '山田' },
      { id: 's2', name: '佐藤' },
    ],
    patterns: [
      { id: 'p1', name: '早番', description: '9:00-', colorHex: '#F44336' },
      { id: 'p2', name: '遅番', description: null, colorHex: '#2196F3' },
    ],
    shifts: [
      { staffId: 's1', date: '2026-09-01', patternId: 'p1', fixed: true },
      { staffId: 's2', date: '2026-09-03', patternId: 'p2', fixed: false },
    ],
    notes: [],
    ...overrides,
  }
}

describe('csvField', () => {
  it('引用が要らない値はそのまま', () => {
    expect(csvField('早番')).toBe('早番')
    expect(csvField('')).toBe('')
  })

  it('`,` `"` 改行を含むときだけ引用し、`"` は二重にする', () => {
    expect(csvField('山田, 太郎')).toBe('"山田, 太郎"')
    expect(csvField('あだ名は"たろ"')).toBe('"あだ名は""たろ"""')
    expect(csvField('1 行目\n2 行目')).toBe('"1 行目\n2 行目"')
    expect(csvField('CR\rあり')).toBe('"CR\rあり"')
  })
})

describe('toShiftCsv', () => {
  it('日付行 → メモ行 → スタッフ行の順で出す（末尾は改行）', () => {
    expect(toShiftCsv(table())).toBe(
      [',2026-09-01,2026-09-02,2026-09-03', ',,,', '山田,早番,,', '佐藤,,,遅番', ''].join('\n')
    )
  })

  it('日付は `YYYY-MM-DD` のまま（画面の `9/1` にしない）', () => {
    expect(toShiftCsv(table()).split('\n')[0]).toBe(',2026-09-01,2026-09-02,2026-09-03')
  })

  it('メモが 1 件も無くてもメモ行は出す（v1 と同じ。列構造を安定させる）', () => {
    expect(toShiftCsv(table()).split('\n')[1]).toBe(',,,')
  })

  it('メモは日付の列に入る', () => {
    const csv = toShiftCsv(table({ notes: [{ date: '2026-09-02', note: '棚卸し' }] }))
    expect(csv.split('\n')[1]).toBe(',,棚卸し,')
  })

  it('確定も下書きも同じくパターン名を出す（CSV に区別は無い。v1 と同じ）', () => {
    const csv = toShiftCsv(
      table({
        shifts: [
          { staffId: 's1', date: '2026-09-01', patternId: 'p1', fixed: true },
          { staffId: 's1', date: '2026-09-02', patternId: 'p1', fixed: false },
        ],
      })
    )
    expect(csv.split('\n')[2]).toBe('山田,早番,早番,')
  })

  it('知らない pattern_id のセルは空にする（行をずらさない）', () => {
    const csv = toShiftCsv(
      table({ shifts: [{ staffId: 's1', date: '2026-09-01', patternId: 'zzz', fixed: true }] })
    )
    expect(csv.split('\n')[2]).toBe('山田,,,')
  })

  it('スタッフ名・パターン名・メモの `,` と `"` を引用する', () => {
    const csv = toShiftCsv(
      table({
        staffs: [{ id: 's1', name: '山田, 太郎' }],
        patterns: [{ id: 'p1', name: '早"番', description: null, colorHex: '#FFFFFF' }],
        notes: [{ date: '2026-09-01', note: 'A,B' }],
        shifts: [{ staffId: 's1', date: '2026-09-01', patternId: 'p1', fixed: true }],
      })
    )
    expect(csv).toBe(
      [',2026-09-01,2026-09-02,2026-09-03', ',"A,B",,', '"山田, 太郎","早""番",,', ''].join('\n')
    )
  })

  it('スタッフが 0 人でもヘッダ 2 行は出す', () => {
    expect(toShiftCsv(table({ staffs: [], shifts: [] }))).toBe(
      [',2026-09-01,2026-09-02,2026-09-03', ',,,', ''].join('\n')
    )
  })
})
