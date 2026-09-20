import { describe, expect, it } from 'vitest'
import { cellStyle, chipStyle, choiceStyle } from './cellStyle'
import { inkColor, tintColor } from '@/lib/patterns/colors'

describe('cellStyle', () => {
  it('空のセルには何も当てない', () => {
    expect(cellStyle(undefined, false)).toBeUndefined()
    expect(cellStyle(undefined, true)).toBeUndefined()
  })

  it('下書きは淡塗り + 同系の濃い文字', () => {
    expect(cellStyle({ name: '早番', colorHex: '#FF5722' }, false)).toEqual({
      backgroundColor: tintColor('#FF5722'),
      color: inkColor('#FF5722'),
    })
  })

  it('確定はパターン色でベタ塗りして白文字', () => {
    expect(cellStyle({ name: '早番', colorHex: '#FF5722' }, true)).toEqual({
      backgroundColor: '#FF5722',
      color: '#FFFFFF',
    })
  })

  it('明るいパターンの確定は濃い文字（黄の上の白文字をやめる）', () => {
    expect(cellStyle({ name: '日勤', colorHex: '#FFEB3B' }, true)).toEqual({
      backgroundColor: '#FFEB3B',
      color: '#1C1917',
    })
  })

  it('白いパターンは塗りでは見分けられないので枠線で描く（下書きは破線・確定は実線）', () => {
    expect(cellStyle({ name: '休み', colorHex: '#FFFFFF' }, false)).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#CED4DA',
      borderStyle: 'dashed',
    })
    expect(cellStyle({ name: '休み', colorHex: '#FFFFFF' }, true)).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#CED4DA',
      borderStyle: 'solid',
    })
  })
})

describe('chipStyle', () => {
  it('凡例・候補のチップは下書きセルと同じ淡塗り', () => {
    expect(chipStyle('#3F51B5')).toEqual({
      backgroundColor: tintColor('#3F51B5'),
      color: inkColor('#3F51B5'),
      borderColor: 'transparent',
    })
  })

  it('白いパターンだけ中立の枠線に落とす（白地に白枠で消えるのを防ぐ）', () => {
    expect(chipStyle('#FFFFFF')).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#CED4DA',
    })
  })
})

describe('choiceStyle', () => {
  it('下書きは淡塗りで、色付きの枠は消す', () => {
    expect(choiceStyle('#FF5722', false)).toEqual({
      backgroundColor: tintColor('#FF5722'),
      color: inkColor('#FF5722'),
      borderColor: 'transparent',
    })
  })

  it('確定はパターン色のベタ塗り', () => {
    expect(choiceStyle('#FF5722', true)).toEqual({
      backgroundColor: '#FF5722',
      color: '#FFFFFF',
      borderColor: 'transparent',
    })
  })

  it('明るいパターンの確定は濃い文字', () => {
    expect(choiceStyle('#FFEB3B', true)).toEqual({
      backgroundColor: '#FFEB3B',
      color: '#1C1917',
      borderColor: 'transparent',
    })
  })

  it('白いパターンは下書きが破線、確定が実線', () => {
    expect(choiceStyle('#FFFFFF', false)).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#CED4DA',
      borderStyle: 'dashed',
    })
    expect(choiceStyle('#FFFFFF', true)).toEqual({
      backgroundColor: '#FFFFFF',
      borderColor: '#CED4DA',
      borderStyle: 'solid',
    })
  })
})
