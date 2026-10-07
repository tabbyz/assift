export type Notice = { message: string; color: 'green' | 'gray' | 'red' }

/**
 * 一括操作の結果の通知（008 §10.7）。
 * 「何も変わらなかった」を成功と同じ緑で流すと、変わっていないのに変わったように見えるので灰色にする。
 */
export function outcome(changed: number, done: string, nothing: string): Notice {
  return changed === 0 ? { message: nothing, color: 'gray' } : { message: done, color: 'green' }
}

/** 失敗の通知。呼び出し側はこのあと `router.refresh()` で読み直す（失敗の主因は画面が古いこと。007 と同じ） */
export function failure(error: string): Notice {
  return { message: error, color: 'red' }
}
