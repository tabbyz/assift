import { beforeEach, describe, expect, it } from 'vitest'
import {
  HOLD_CANCEL_PX,
  consumeHoldClick,
  markHoldToggle,
  movedPastHold,
} from './holdToToggle'

describe('movedPastHold', () => {
  const origin = { x: 100, y: 200 }

  it('押した場所の揺れでは長押しをやめない', () => {
    expect(movedPastHold(origin, { x: 100 + HOLD_CANCEL_PX, y: 200 })).toBe(false)
    expect(movedPastHold(origin, { x: 100, y: 200 - HOLD_CANCEL_PX })).toBe(false)
  })

  it('それより動いたら長押しをやめる（表のスクロール）', () => {
    expect(movedPastHold(origin, { x: 100 + HOLD_CANCEL_PX + 1, y: 200 })).toBe(true)
    expect(movedPastHold(origin, { x: 92, y: 192 })).toBe(true)
  })
})

describe('consumeHoldClick', () => {
  beforeEach(() => {
    markHoldToggle('reset', 0)
    consumeHoldClick('reset', 0)
  })

  it('長押ししたセルの直後の click だけを 1 回捨てる', () => {
    expect(consumeHoldClick('a', 1_000)).toBe(false)
    markHoldToggle('a', 1_000)
    expect(consumeHoldClick('a', 1_500)).toBe(true)
    expect(consumeHoldClick('a', 1_500)).toBe(false)
  })

  it('別のセルのタップはポップオーバーを開く', () => {
    markHoldToggle('a', 1_000)
    expect(consumeHoldClick('b', 1_200)).toBe(false)
    expect(consumeHoldClick('a', 1_200)).toBe(true)
  })

  it('印が切れたあとの click はポップオーバーを開く', () => {
    markHoldToggle('a', 1_000)
    expect(consumeHoldClick('a', 1_701)).toBe(false)
  })
})
