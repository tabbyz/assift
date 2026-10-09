// このファイルには 'use server' を付けない（付けると全 export がエンドポイントになる）。
// Client Component からも import できる型定義だけを置く。

export type ActionSuccess<T> = { ok: true; data: T }
/**
 * `code` は画面が文言以外で分岐するときだけ付ける（例: スタッフの上限で止まったら案内のモーダルを開く。019 §5.3）。
 * `price_increase` はスタッフを増やすと今の請求期間の料金が上がるので、確認してからやり直す（019 §13.5）
 */
export type ActionErrorCode = 'staff_limit' | 'price_increase'
export type ActionFailure = { ok: false; error: string; code?: ActionErrorCode }
// 戻り値の無い Action は runAction(async () => { ... }) が ActionResult<void> になるので既定は void
export type ActionResult<T = void> = ActionSuccess<T> | ActionFailure
