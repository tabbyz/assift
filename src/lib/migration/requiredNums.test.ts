import { describe, expect, it } from 'vitest'
import { judgeBakedRequiredNum } from './requiredNums'

// 2026-10-05 は月曜、2026-10-10 は土曜、2026-10-12 はスポーツの日（月曜・祝日）
const defaults = { '1': 2, '6': 1, holiday: 3 }

describe('judgeBakedRequiredNum', () => {
  it('曜日の基本と同じ値は焼き付け', () => {
    expect(judgeBakedRequiredNum(2, defaults, '2026-10-05', false)).toEqual({
      baked: true,
      base: 2,
      unset: false,
    })
  })

  it('曜日の基本と違う値は上書き（残す）', () => {
    expect(judgeBakedRequiredNum(3, defaults, '2026-10-05', false)).toEqual({ baked: false })
    expect(judgeBakedRequiredNum(0, defaults, '2026-10-05', false)).toEqual({ baked: false })
  })

  it('祝日は holiday キーで比べる（曜日の値ではない）', () => {
    // 月曜の基本は 2 だが祝日なので holiday の 3 と比べる
    expect(judgeBakedRequiredNum(3, defaults, '2026-10-12', true)).toEqual({
      baked: true,
      base: 3,
      unset: false,
    })
    expect(judgeBakedRequiredNum(2, defaults, '2026-10-12', true)).toEqual({ baked: false })
  })

  it('基本が未設定の曜日は 0 が焼き付け（「0 人」→「未設定」になる。015 §9.2）', () => {
    // 2026-10-06 は火曜。defaults に '2' が無い
    expect(judgeBakedRequiredNum(0, defaults, '2026-10-06', false)).toEqual({
      baked: true,
      base: 0,
      unset: true,
    })
    expect(judgeBakedRequiredNum(1, defaults, '2026-10-06', false)).toEqual({ baked: false })
  })

  it('holiday が無い店の祝日は 0 が焼き付け', () => {
    expect(judgeBakedRequiredNum(0, { '1': 2 }, '2026-10-12', true)).toEqual({
      baked: true,
      base: 0,
      unset: true,
    })
    // 祝日の行が曜日の値（2）で入っていれば上書きとして残る（表示は v1 と同じ数になる）
    expect(judgeBakedRequiredNum(2, { '1': 2 }, '2026-10-12', true)).toEqual({ baked: false })
  })

  it('基本が空（{}）なら 0 だけが焼き付け', () => {
    expect(judgeBakedRequiredNum(0, {}, '2026-10-10', false).baked).toBe(true)
    expect(judgeBakedRequiredNum(1, {}, '2026-10-10', false).baked).toBe(false)
  })
})
