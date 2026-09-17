// このファイルには 'use server' を付けない（付けると全 export がエンドポイントになる）。
// Client Component からも import できる型定義だけを置く。

export type ActionSuccess<T> = { ok: true; data: T }
export type ActionFailure = { ok: false; error: string }
// 戻り値の無い Action は runAction(async () => { ... }) が ActionResult<void> になるので既定は void
export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure
