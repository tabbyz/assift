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
