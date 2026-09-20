/**
 * 勤務パターンに設定できる色（v1 の Pattern::COLOR_HEXS を踏襲。Material Design の 20 色）
 */
export const PATTERN_COLORS = [
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Red', hex: '#F44336' },
  { name: 'Pink', hex: '#E91E63' },
  { name: 'Purple', hex: '#9C27B0' },
  { name: 'Deep Purple', hex: '#673AB7' },
  { name: 'Indigo', hex: '#3F51B5' },
  { name: 'Blue', hex: '#2196F3' },
  { name: 'Light Blue', hex: '#03A9F4' },
  { name: 'Cyan', hex: '#00BCD4' },
  { name: 'Teal', hex: '#009688' },
  { name: 'Green', hex: '#4CAF50' },
  { name: 'Lime', hex: '#CDDC39' },
  { name: 'Yellow', hex: '#FFEB3B' },
  { name: 'Amber', hex: '#FFC107' },
  { name: 'Orange', hex: '#FF9800' },
  { name: 'Deep Orange', hex: '#FF5722' },
  { name: 'Brown', hex: '#795548' },
  { name: 'Grey', hex: '#9E9E9E' },
  { name: 'Blue Grey', hex: '#607D8B' },
  { name: 'Black', hex: '#000000' },
] as const

export type PatternColorHex = (typeof PATTERN_COLORS)[number]['hex']

/** 色未設定のパターンはこの色で描く */
export const DEFAULT_PATTERN_COLOR: PatternColorHex = '#FFFFFF'

/**
 * 確定シフトの文字色（v1 の `style_shift_text_color`）。
 * パターン色で塗った上に白文字を載せるが、白いパターンだけは既定の文字色のままにする。
 */
export function fixedTextColor(colorHex: string): string | undefined {
  return colorHex.toUpperCase() === '#FFFFFF' ? undefined : '#FFFFFF'
}

/**
 * 枠線でパターン色を示す場所（ポップオーバーの候補・表の下の凡例）の枠線色。
 *
 * **白いパターンは枠線まで白くすると要素ごと見えなくなる**（v1 も同じだった）。
 * これらの場所では枠線が色の唯一の手がかりなので、白のときだけ既定の枠線色に落とす。
 * セルは塗り・太字・名前でも見分けられるので、こちらは通さず `cellStyle()` がそのまま当てる。
 */
export function outlineColor(colorHex: string): string | undefined {
  return colorHex.toUpperCase() === '#FFFFFF' ? undefined : colorHex
}
