import { unstable_rethrow } from 'next/navigation'
import { ZodError } from 'zod'
import { ActionError, toActionError } from './error'
import type { ActionResult } from './result'

/**
 * Server Action の本体を包み、例外を ActionResult に変換する。
 * redirect() / notFound() が投げる内部例外は unstable_rethrow で再スローする。
 *
 * 想定外の例外（ActionError でも ZodError でもないもの）は画面に「処理に失敗しました」としか出ないので、
 * `[action]` を付けてログに残す（031。Axiom の監視が拾う）。業務上の失敗と入力の誤りは想定どおりなので残さない。
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (error) {
    unstable_rethrow(error)
    if (!(error instanceof ActionError) && !(error instanceof ZodError)) {
      console.error('[action] 想定外のエラー', error)
    }
    const code = error instanceof ActionError ? error.code : undefined
    return code
      ? { ok: false, error: toActionError(error), code }
      : { ok: false, error: toActionError(error) }
  }
}
