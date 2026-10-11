/**
 * 文字数の切り詰め（021 §6.2・003 §3.10）。
 *
 * 数え方は Postgres の `char_length()` と同じ**コードポイント単位**（`String#length` の UTF-16 単位ではない。
 * 絵文字や一部の漢字はサロゲートペアで `length` が 2 になり、CHECK の長さと食い違う）。
 *
 * 切り詰めは `.trim()` の後（§7 共通）。レポートには値そのものではなく前後の文字数だけを残す（§6.1）。
 */

export type Truncated = {
  value: string
  truncated: boolean
  /** 切り詰め前後のコードポイント数（レポート用。値は書かない） */
  before: number
  after: number
}

/** コードポイント数（`char_length` と同じ） */
export function charLength(value: string): number {
  return Array.from(value).length
}

export function truncate(value: string, max: number): Truncated {
  const trimmed = value.trim()
  const before = charLength(trimmed)
  if (before <= max) return { value: trimmed, truncated: false, before, after: before }
  const chars = Array.from(trimmed)
  return { value: chars.slice(0, max).join(''), truncated: true, before, after: max }
}
