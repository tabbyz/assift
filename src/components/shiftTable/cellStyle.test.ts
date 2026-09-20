import { describe, expect, it } from 'vitest'
import { cellStyle } from './cellStyle'

describe('cellStyle', () => {
  it('空のセルには何も当てない', () => {
    expect(cellStyle(undefined, false)).toBeUndefined()
    expect(cellStyle(undefined, true)).toBeUndefined()
  })

  it('下書きは枠だけパターン色にする（塗らない）', () => {
    expect(cellStyle({ name: '早番', colorHex: '#FF5722' }, false)).toEqual({
      borderColor: '#FF5722',
    })
  })

  it('確定はパターン色で塗って白文字', () => {
    expect(cellStyle({ name: '早番', colorHex: '#FF5722' }, true)).toEqual({
      borderColor: '#FF5722',
      backgroundColor: '#FF5722',
      color: '#FFFFFF',
    })
  })

  it('白いパターンの確定は文字色を変えない（白地に白文字にしない）', () => {
    expect(cellStyle({ name: '休み', colorHex: '#FFFFFF' }, true)).toEqual({
      borderColor: '#FFFFFF',
      backgroundColor: '#FFFFFF',
      color: undefined,
    })
  })
})
