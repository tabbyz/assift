import { describe, expect, it } from 'vitest'
import { dateRange, defaultStart, nextStart, prevStart } from './dateRange'

/** テストを読みやすくする: 範囲を `start..end (日数)` で見る */
const show = (r: { start: string; end: string; dates: string[] }) =>
  `${r.start}..${r.end} (${r.dates.length})`

describe('dateRange: week', () => {
  it('週の始まり（日曜）まで戻して 7 日', () => {
    // 2026-09-18 は金曜
    expect(show(dateRange('week', 0, '2026-09-18'))).toBe('2026-09-13..2026-09-19 (7)')
  })

  it('週の始まりが月曜なら月曜から', () => {
    expect(show(dateRange('week', 1, '2026-09-18'))).toBe('2026-09-14..2026-09-20 (7)')
  })

  it('開始日が週初そのものなら動かない', () => {
    expect(show(dateRange('week', 0, '2026-09-13'))).toBe('2026-09-13..2026-09-19 (7)')
  })

  it('週の始まりが土曜（前日が週初）でも 1 日だけ戻る', () => {
    expect(show(dateRange('week', 6, '2026-09-13'))).toBe('2026-09-12..2026-09-18 (7)')
  })
})

describe('dateRange: two_week', () => {
  it('週初から 14 日', () => {
    expect(show(dateRange('two_week', 0, '2026-09-18'))).toBe('2026-09-13..2026-09-26 (14)')
  })
})

describe('dateRange: half_month', () => {
  it('15 日までは前半（1〜15）', () => {
    expect(show(dateRange('half_month', 0, '2026-09-15'))).toBe('2026-09-01..2026-09-15 (15)')
    expect(show(dateRange('half_month', 0, '2026-09-01'))).toBe('2026-09-01..2026-09-15 (15)')
  })

  it('16 日以降は後半（16〜月末）', () => {
    expect(show(dateRange('half_month', 0, '2026-09-18'))).toBe('2026-09-16..2026-09-30 (15)')
  })

  it('2 月の後半は 13 日間', () => {
    expect(show(dateRange('half_month', 0, '2026-02-20'))).toBe('2026-02-16..2026-02-28 (13)')
    expect(show(dateRange('half_month', 0, '2024-02-20'))).toBe('2024-02-16..2024-02-29 (14)')
  })

  it('31 日ある月の後半は 16 日間', () => {
    expect(show(dateRange('half_month', 0, '2026-01-31'))).toBe('2026-01-16..2026-01-31 (16)')
  })
})

describe('dateRange: month', () => {
  it('開始日から翌月同日の前日まで（1 日固定ではない）', () => {
    expect(show(dateRange('month', 0, '2026-09-01'))).toBe('2026-09-01..2026-09-30 (30)')
    expect(show(dateRange('month', 0, '2026-09-10'))).toBe('2026-09-10..2026-10-09 (30)')
  })

  it('2 月をまたぐと日数が縮む', () => {
    expect(show(dateRange('month', 0, '2026-02-01'))).toBe('2026-02-01..2026-02-28 (28)')
  })

  it('月末始まりは翌月末に丸まる', () => {
    // 1/31 + 1 month = 2/28 なので、その前日まで
    expect(show(dateRange('month', 0, '2026-01-31'))).toBe('2026-01-31..2026-02-27 (28)')
  })
})

describe('prevStart / nextStart: week / two_week', () => {
  it('±7 / ±14 日', () => {
    const w = dateRange('week', 0, '2026-09-18')
    expect(prevStart('week', w)).toBe('2026-09-06')
    expect(nextStart('week', w)).toBe('2026-09-20')

    const t = dateRange('two_week', 0, '2026-09-18')
    expect(prevStart('two_week', t)).toBe('2026-08-30')
    expect(nextStart('two_week', t)).toBe('2026-09-27')
  })

  it('往復すると元に戻る', () => {
    const w = dateRange('week', 0, '2026-09-18')
    expect(dateRange('week', 0, prevStart('week', w)).start).toBe('2026-09-06')
    const back = dateRange('week', 0, nextStart('week', dateRange('week', 0, w.start)))
    expect(prevStart('week', back)).toBe(w.start)
  })
})

describe('prevStart / nextStart: half_month', () => {
  it('前半 ↔ 後半で行き来する', () => {
    const first = dateRange('half_month', 0, '2026-09-05')
    expect(prevStart('half_month', first)).toBe('2026-08-16')
    expect(nextStart('half_month', first)).toBe('2026-09-16')

    const second = dateRange('half_month', 0, '2026-09-20')
    expect(prevStart('half_month', second)).toBe('2026-09-01')
    expect(nextStart('half_month', second)).toBe('2026-10-01')
  })

  it('年をまたぐ', () => {
    const jan = dateRange('half_month', 0, '2026-01-05')
    expect(prevStart('half_month', jan)).toBe('2025-12-16')
    const dec = dateRange('half_month', 0, '2025-12-20')
    expect(nextStart('half_month', dec)).toBe('2026-01-01')
  })

  // v1 は −13 / +16 の固定値だった。2 月後半からの移動で同じ結果になることを見る
  it('2 月後半から前へ戻ると 2 月前半になる', () => {
    const feb = dateRange('half_month', 0, '2026-02-20')
    expect(prevStart('half_month', feb)).toBe('2026-02-01')
    expect(show(dateRange('half_month', 0, prevStart('half_month', feb)))).toBe(
      '2026-02-01..2026-02-15 (15)'
    )
  })
})

describe('prevStart / nextStart: month', () => {
  it('±1 か月', () => {
    const m = dateRange('month', 0, '2026-09-01')
    expect(prevStart('month', m)).toBe('2026-08-01')
    expect(nextStart('month', m)).toBe('2026-10-01')
  })

  it('1 日始まりなら往復してもずれない', () => {
    let start = '2026-01-01'
    for (let i = 0; i < 14; i += 1) start = nextStart('month', dateRange('month', 0, start))
    for (let i = 0; i < 14; i += 1) start = prevStart('month', dateRange('month', 0, start))
    expect(start).toBe('2026-01-01')
  })

  // v1 と同じ挙動（007 §5.1）。月末始まりは丸められるので往復で戻らない
  it('月末始まりは月末に丸まる', () => {
    const m = dateRange('month', 0, '2026-01-31')
    expect(nextStart('month', m)).toBe('2026-02-28')
    expect(nextStart('month', dateRange('month', 0, '2026-02-28'))).toBe('2026-03-28')
  })
})

describe('defaultStart', () => {
  it('月初', () => {
    expect(defaultStart('2026-09-18')).toBe('2026-09-01')
  })
})
