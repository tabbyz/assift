import { describe, expect, it } from 'vitest'
import { DRAFT_BAND_WIDTH, pdfCellStyle, pdfDraftBandStyle } from './pdfCellStyle'

describe('pdfCellStyle', () => {
  it('空のセルには何も当てない', () => {
    expect(pdfCellStyle(undefined, false)).toBeUndefined()
    expect(pdfCellStyle(undefined, true)).toBeUndefined()
  })

  it('下書きは白地・既定の文字色のまま（v1 の `!important` と同じ結果）', () => {
    expect(pdfCellStyle({ colorHex: '#FF5722' }, false)).toBeUndefined()
  })

  it('確定はパターン色で塗って白文字 + 太字', () => {
    expect(pdfCellStyle({ colorHex: '#FF5722' }, true)).toEqual({
      backgroundColor: '#FF5722',
      color: '#FFFFFF',
      fontWeight: 700,
    })
  })

  it('白いパターンの確定は文字色を変えない。太字だけが下書きとの違いになる', () => {
    expect(pdfCellStyle({ colorHex: '#FFFFFF' }, true)).toEqual({
      backgroundColor: '#FFFFFF',
      color: undefined,
      fontWeight: 700,
    })
  })
})

describe('pdfDraftBandStyle', () => {
  it('帯の幅は v1 の 1.5mm（4.3pt）', () => {
    expect(DRAFT_BAND_WIDTH).toBe(4.3)
  })

  it('下書きだけ上辺に帯を出す', () => {
    expect(pdfDraftBandStyle({ colorHex: '#2196F3' }, false)).toEqual({
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: DRAFT_BAND_WIDTH,
      backgroundColor: '#2196F3',
    })
  })

  it('確定と空のセルには出さない', () => {
    expect(pdfDraftBandStyle({ colorHex: '#2196F3' }, true)).toBeUndefined()
    expect(pdfDraftBandStyle(undefined, false)).toBeUndefined()
  })

  it('絶対配置にする（border にすると行の高さを食って 3 行目が切れる）', () => {
    expect(pdfDraftBandStyle({ colorHex: '#2196F3' }, false)?.position).toBe('absolute')
  })
})
