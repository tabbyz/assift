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

/** 確定セルのインク。明るいパターンの上では白文字が読めない */
export const FIXED_INK = '#1C1917'
export const FIXED_PAPER = '#FFFFFF'

/**
 * 白いパターンだけに使う枠線色（Mantine gray-4 相当）。
 * 塗りでも文字色でも見分けられないので、ここだけ中立の線で輪郭を作る。
 */
export const NEUTRAL_OUTLINE = '#CED4DA'

/** 淡塗り（下書き）の混色比。パターン色 12% + 白 88% */
const TINT_RATIO = 0.12

/**
 * 淡塗りの上に載せる文字の輝度の上限。
 *
 * 淡塗りの輝度は最も暗いパターンでも 0.82 程度なので、インクをここまで落としておけば
 * コントラスト比 4.5:1 を下回らない。**この 2 つは対で調整する**（片方だけ動かすと読めなくなる）。
 */
const INK_MAX_LUMINANCE = 0.13

type Rgb = [number, number, number]

function hexRgb(colorHex: string): Rgb | null {
  const n = colorHex.replace('#', '')
  if (n.length !== 6) return null
  const r = Number.parseInt(n.slice(0, 2), 16)
  const g = Number.parseInt(n.slice(2, 4), 16)
  const b = Number.parseInt(n.slice(4, 6), 16)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
  return [r, g, b]
}

function rgbHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0').toUpperCase()).join('')}`
}

function linearize(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function rgbLuminance([r, g, b]: Rgb): number {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}

function relativeLuminance(colorHex: string): number {
  const rgb = hexRgb(colorHex)
  return rgb ? rgbLuminance(rgb) : 0
}

/** 白いパターン。塗りでも枠でも見えないので、どの場所でも例外扱いになる */
export function isWhitePattern(colorHex: string): boolean {
  return colorHex.toUpperCase() === '#FFFFFF'
}

/**
 * 確定シフトの文字色。塗りの輝度でインクを切る（黄・ライムは白文字だと読めない）。
 * 白いパターンは既定の文字色のまま（下書きとの差は太字だけ）。
 */
export function fixedTextColor(colorHex: string): string | undefined {
  if (isWhitePattern(colorHex)) return undefined
  return relativeLuminance(colorHex) > 0.55 ? FIXED_INK : FIXED_PAPER
}

/**
 * 下書きの塗り。パターン色を白で薄めた色を返す。
 *
 * 保存済みの hex から導くので、**DB のパレット（`PATTERN_COLORS`）は触らない**。
 * v1 から移行した行も、ユーザーが後から選んだ色も、同じ規則で淡塗りになる。
 */
export function tintColor(colorHex: string): string {
  const rgb = hexRgb(colorHex)
  if (!rgb) return FIXED_PAPER
  const mixed = rgb.map((c) => Math.round(c * TINT_RATIO + 255 * (1 - TINT_RATIO))) as Rgb
  return rgbHex(mixed)
}

/**
 * 淡塗りの上に載せる文字色。パターン色そのままでは明るい色（黄・ライム）が読めないので、
 * 輝度が `INK_MAX_LUMINANCE` に収まるまで sRGB の各チャンネルを同じ比率で落とす。
 *
 * 比率を決め打ちにしないのは、20 色の明るさがばらばらだから。暗い色（紺・茶）は
 * そのまま返るので、色味は保たれる。
 */
export function inkColor(colorHex: string): string {
  const rgb = hexRgb(colorHex)
  if (!rgb) return FIXED_INK
  if (isWhitePattern(colorHex)) return FIXED_INK
  if (rgbLuminance(rgb) <= INK_MAX_LUMINANCE) return rgbHex(rgb)

  // 輝度は単調増加なので二分探索でよい。20 回で 8bit の分解能を下回る
  let dark = 0
  let light = 1
  for (let i = 0; i < 20; i += 1) {
    const mid = (dark + light) / 2
    const scaled = rgb.map((c) => Math.round(c * mid)) as Rgb
    if (rgbLuminance(scaled) > INK_MAX_LUMINANCE) light = mid
    else dark = mid
  }
  return rgbHex(rgb.map((c) => Math.round(c * dark)) as Rgb)
}

/**
 * 枠線でパターン色を示す場所（PDF の凡例）の枠線色。
 *
 * **白いパターンは枠線まで白くすると要素ごと見えなくなる**（v1 も同じだった）。
 * これらの場所では枠線が色の唯一の手がかりなので、白のときだけ中立の枠線色に落とす。
 */
export function outlineColor(colorHex: string): string | undefined {
  return isWhitePattern(colorHex) ? undefined : colorHex
}
