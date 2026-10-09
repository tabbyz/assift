/** 課金（019）の Stripe 側の識別子。server-only を持ち込まないよう SDK（stripe.ts）とは分ける */

/**
 * 旧 metered の明細（v1 の `freemium-monthly`）を含む Subscription を触る呼び出しだけに使う版（019 §8.2）。
 * basil 以降は meter の無い metered price を扱えないため、移行の schedule の作成・更新はこの版で行う
 */
export const LEGACY_API_VERSION = '2025-02-24.acacia'

/** 料金の price（graduated tiers: 10 人まで 0 円、11 人目から 100 円）。id ではなく lookup_key で引く */
export const PRICE_LOOKUP_KEY = 'assift_monthly'

/** v1 の旧 metered の price（plan）の id。lookup_key は無い */
export const LEGACY_PRICE_ID = 'freemium-monthly'

/** 旧料金（v1 からの継続）のクーポン。Subscription にだけ付ける（Customer に付けると申し込み直しにも引き継がれる） */
export const LEGACY_COUPON_ID = 'assift_v1_legacy'

/** Billing Meter のイベント名（集計は last） */
export const METER_EVENT_NAME = 'active_staffs'

/** v2 で作る Customer の metadata のキー。v1 が作った Customer の `user_id`（v1 の数字の id）とは別にする */
export const CUSTOMER_USER_ID_KEY = 'assift_user_id'
