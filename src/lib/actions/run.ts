import { unstable_rethrow } from 'next/navigation'
import { toActionError } from './error'
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
    return { ok: false, error: toActionError(error) }
  }
}
