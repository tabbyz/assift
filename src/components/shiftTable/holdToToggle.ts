/** 長押しで下書きと確定を切り替えるまでの時間。短いタップ（ポップオーバー）と分けられる長さ */
export const HOLD_TO_TOGGLE_MS = 500

/** これより短いタップでは、下端のインクを出さない（クリックのたびに線がちらつかない） */
export const HOLD_FEEDBACK_DELAY_MS = 150

/**
 * これより大きく指が動いたら長押しをやめる。
 * セルは 35×56px なので、表をスクロールし始めた動きと、押したままの揺れを分ける。
 */
export const HOLD_CANCEL_PX = 10

/** 長押しの確定後に届く click を、この時間だけ飲み込む */
const SUPPRESS_CLICK_MS = 700

let suppressedClick: { key: string; until: number } | null = null

export function movedPastHold(
  origin: { x: number; y: number },
  point: { x: number; y: number }
): boolean {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  return dx * dx + dy * dy > HOLD_CANCEL_PX * HOLD_CANCEL_PX
}

/**
 * 長押しで切り替えた直後の click を捨てる印。
 *
 * セルは確定の切替で remount することがある（開いていたポップオーバーが閉じる）。
 * 印をコンポーネントの中に置くと、新しいセルの click がポップオーバーを開き直してしまう。
 */
export function markHoldToggle(key: string, now = performance.now()): void {
  suppressedClick = { key, until: now + SUPPRESS_CLICK_MS }
}

/**
 * 同じセルの click なら true を返し、その 1 回だけ捨てる。
 * 別のセルのタップは飲み込まない。
 */
export function consumeHoldClick(key: string, now = performance.now()): boolean {
  if (!suppressedClick) return false
  if (now > suppressedClick.until) {
    suppressedClick = null
    return false
  }
  if (suppressedClick.key !== key) return false
  suppressedClick = null
  return true
}
