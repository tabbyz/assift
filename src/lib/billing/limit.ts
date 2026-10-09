import { ActionError } from '@/lib/actions/error'

/**
 * スタッフの上限（019 §5.3）。DB の門番（`private.guard_staff_limit()`）が投げる例外の message。
 * 画面の文言は Action がここで日本語に差し替え、`code: 'staff_limit'` を付けて返す（クライアントが案内のモーダルを開く）
 */
export const STAFF_LIMIT_EXCEPTION = 'staff_limit_exceeded'

export const STAFF_LIMIT_MESSAGE = 'ご利用中のプランの在籍スタッフの上限に達しています'

export function isStaffLimitError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message?.includes(STAFF_LIMIT_EXCEPTION))
}

export function staffLimitError(): ActionError {
  return new ActionError(STAFF_LIMIT_MESSAGE, 'staff_limit')
}

/** PostgREST / RPC のエラーを受け、上限なら日本語の ActionError に、それ以外はそのまま投げる */
export function throwIfStaffLimit(error: { message?: string } | null | undefined): void {
  if (isStaffLimitError(error)) throw staffLimitError()
}

export const PRICE_INCREASE_MESSAGE = 'この追加で今の請求期間の料金が上がります'

/** スタッフを増やすと今の請求期間の料金が上がる（019 §13.5）。画面は確認のモーダルを開き、確認したらやり直す */
export function priceIncreaseError(): ActionError {
  return new ActionError(PRICE_INCREASE_MESSAGE, 'price_increase')
}

export const STAFF_CAP_BELOW_ACTIVE_MESSAGE = '上限は在籍している人数以上にしてください'

/** `public.set_staff_cap()` の例外 → 日本語（申し込み・上限の変更・上限の引き上げで共有。§13.4） */
const STAFF_CAP_MESSAGES: { match: string; message: string }[] = [
  { match: 'set_staff_cap: below active count', message: STAFF_CAP_BELOW_ACTIVE_MESSAGE },
  { match: 'set_staff_cap: out of range', message: '上限の人数が正しくありません' },
]

export function throwIfStaffCapError(error: { message?: string } | null | undefined): void {
  const known = STAFF_CAP_MESSAGES.find((entry) => error?.message?.includes(entry.match))
  if (known) throw new ActionError(known.message)
}
