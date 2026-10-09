import { unstable_rethrow } from 'next/navigation'
import { ActionError, toActionError } from './error'
import type { ActionResult } from './result'

/**
 * Server Action の本体を包み、例外を ActionResult に変換する。
 * redirect() / notFound() が投げる内部例外は unstable_rethrow で再スローする。
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (error) {
    unstable_rethrow(error)
    const code = error instanceof ActionError ? error.code : undefined
    return code
      ? { ok: false, error: toActionError(error), code }
      : { ok: false, error: toActionError(error) }
  }
}
