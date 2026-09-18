import { describe, expect, it } from 'vitest'
import { moveItem } from './move'

describe('moveItem', () => {
  const items = ['a', 'b', 'c', 'd']

  it('1 つ上へ動かす', () => {
    expect(moveItem(items, 2, -1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('1 つ下へ動かす', () => {
    expect(moveItem(items, 1, 1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('先頭をさらに上へ動かしても変わらない', () => {
    expect(moveItem(items, 0, -1)).toEqual(items)
  })

  it('末尾をさらに下へ動かしても変わらない', () => {
    expect(moveItem(items, 3, 1)).toEqual(items)
  })

  it('範囲外の index は無視する', () => {
    expect(moveItem(items, 9, -1)).toEqual(items)
    expect(moveItem(items, -1, 1)).toEqual(items)
  })

  it('元の配列を変更しない', () => {
    const original = [...items]
    moveItem(items, 1, 1)
    expect(items).toEqual(original)
  })

  it('空配列でも落ちない', () => {
    expect(moveItem([], 0, 1)).toEqual([])
  })
})
