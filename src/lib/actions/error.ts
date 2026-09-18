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

/**
 * 日本語（ひらがな・カタカナ・漢字・全角記号）を 1 文字でも含むか。
 *
 * AGENTS.md の規約どおり、このアプリのバリデーションメッセージはすべて日本語で書く。
 * したがって「日本語を含まない」= スキーマに `{ error }` を書き忘れて Zod の既定
 * （`Invalid input: expected number, received string` など）が漏れている、と判定できる（006 §3.12）。
 *
 * issue の `code` で判定すると、`{ error }` を正しく付けた invalid_type の日本語まで潰してしまう。
 */
const JAPANESE = /[\u3000-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]/

/**
 * 既定メッセージに**入力値そのもの**が埋め込まれる issue。
 * 例: `z.partialRecord` の未知キーは `Unrecognized key: "あ"` になるため、キーに日本語が 1 文字でも
 * 入っていると上の判定をすり抜けて英語が画面に出る。これらは UI が正しければ起きないので、
 * メッセージを見ずに汎用文言へ落とす。
 */
const ECHOES_INPUT = new Set(['unrecognized_keys', 'invalid_key', 'invalid_element'])

/** 例外をユーザー向けメッセージに変換する。Zod は先頭 issue のメッセージ（各スキーマで日本語を指定する） */
export function toActionError(error: unknown): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0]
    if (!issue) return INVALID_INPUT_MESSAGE
    if (ECHOES_INPUT.has(issue.code)) return INVALID_INPUT_MESSAGE
    if (!JAPANESE.test(issue.message)) return INVALID_INPUT_MESSAGE
    return issue.message
  }
  if (error instanceof ActionError) return error.message
  return GENERIC_ERROR_MESSAGE
}
