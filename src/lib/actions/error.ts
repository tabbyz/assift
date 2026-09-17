import { ZodError } from 'zod'

/** ユーザーに見せてよいメッセージを持つ業務エラー。guard や Action 内で throw する */
export class ActionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ActionError'
  }
}

export function fail(message: string): never {
  throw new ActionError(message)
}

export const GENERIC_ERROR_MESSAGE = '処理に失敗しました'
export const INVALID_INPUT_MESSAGE = '入力内容が正しくありません'

/** 例外をユーザー向けメッセージに変換する。Zod は先頭 issue のメッセージ（各スキーマで日本語を指定する） */
export function toActionError(error: unknown): string {
  if (error instanceof ZodError) return error.issues[0]?.message ?? INVALID_INPUT_MESSAGE
  if (error instanceof ActionError) return error.message
  return GENERIC_ERROR_MESSAGE
}
