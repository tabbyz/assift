// このファイルには 'use server' を付けない（付けると全 export がエンドポイントになる）。
// Client Component からも import できる型定義だけを置く。

export type ActionSuccess<T> = { ok: true; data: T }
export type ActionFailure = { ok: false; error: string }
export type ActionResult<T = undefined> = ActionSuccess<T> | ActionFailure
