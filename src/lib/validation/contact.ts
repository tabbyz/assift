import { z } from 'zod'
import { emailSchema } from './auth'

/** お問い合わせの種類（031 §4.3）。キーは URL の `?topic=` とメールの件名に使う */
export const CONTACT_TOPICS = {
  usage: '使い方',
  billing: '料金・契約',
  bug: '不具合',
  account: '退会・データ',
  other: 'その他',
} as const
export type ContactTopic = keyof typeof CONTACT_TOPICS
export const CONTACT_TOPIC_KEYS = Object.keys(CONTACT_TOPICS) as [ContactTopic, ...ContactTopic[]]

export const CONTACT_BODY_MAX_LENGTH = 5000

/** 添付（031 §4.7）。ブラウザで縮小してから送るので、上限は縮小を経ずに送られたものを弾くためのもの */
export const CONTACT_IMAGE_MAX_COUNT = 3
/** 長い辺の上限と JPEG の品質（0〜1）。ブラウザの縮小とサーバーの書き出し直しで同じ値を使う */
export const CONTACT_IMAGE_MAX_EDGE = 1600
export const CONTACT_IMAGE_JPEG_QUALITY = 0.85
export const CONTACT_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024
/** `bodySizeLimit`（`next.config.ts` の `4mb`）から multipart の区切りと本文の分を残す */
export const CONTACT_IMAGES_TOTAL_MAX_BYTES = 3.5 * 1024 * 1024
/** 送れなかったときの文言。画面はこの文言のときだけ、代わりのアドレスを案内する（031 §4.3） */
export const CONTACT_SEND_FAILED_MESSAGE =
  '送信できませんでした。時間をおいてもう一度お試しください'
/** 添付の文言。ブラウザ（選んだとき）とサーバー（送ったとき）で同じものを出す */
export const CONTACT_IMAGE_UNREADABLE_MESSAGE =
  'この画像は添付できません。PNG・JPEG・WebP の画像を選んでください'
export const CONTACT_IMAGES_LIMIT_MESSAGE = `画像は${CONTACT_IMAGE_MAX_COUNT}枚まで、合計${CONTACT_IMAGES_TOTAL_MAX_BYTES / 1024 / 1024}MBまで添付できます。枚数を減らしてください`
export const CONTACT_IMAGE_TOO_LARGE_MESSAGE =
  '画像が大きすぎて添付できません。画面の一部を切り取るなどして小さくしてください'

/**
 * Next のエラー番号（`error.digest`）。英数字とハイフン・下線だけ。URL（`?digest=`）から来るので形と長さで絞る。
 * 形に合わなければ付けない（失敗にはしない）
 */
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
export function parseDigest(value: string | null | undefined): string | undefined {
  return value && DIGEST_PATTERN.test(value) ? value : undefined
}

/** フォームの空欄は `''` で届く。任意の欄は空なら無いものとして扱う */
const blankToUndefined = (value: unknown) => (value === '' ? undefined : value)

/**
 * お問い合わせの送信（`FormData` の文字列の欄。添付は `lib/contact/attachments.ts`、ハニーポットは Action が parse の前に見る）。
 * `email` はログイン中は使わない（アカウントのアドレスに返す。031 §3-5）ので、ここでは任意にし、Action が未ログインのときだけ求める
 */
export const contactSchema = z.object({
  topic: z.enum(CONTACT_TOPIC_KEYS, { error: 'お問い合わせの種類を選んでください' }),
  email: z.preprocess(blankToUndefined, emailSchema.optional()),
  body: z
    .string({ error: 'お問い合わせの内容を入力してください' })
    .trim()
    .min(1, { error: 'お問い合わせの内容を入力してください' })
    .max(CONTACT_BODY_MAX_LENGTH, {
      error: `お問い合わせの内容は${CONTACT_BODY_MAX_LENGTH.toLocaleString()}文字以内で入力してください`,
    }),
  /** フォームを開いたときにクライアントが作る uuid。Resend の `Idempotency-Key` に使う（031 §4.5） */
  requestId: z.guid({ error: '送信できませんでした。ページを読み込み直してください' }),
  /** 店舗（`?tenant=`）。見えるかは Action が RLS で確かめる */
  tenantId: z.preprocess(blankToUndefined, z.guid().optional().catch(undefined)),
  digest: z.preprocess(
    blankToUndefined,
    z.string().optional().transform(parseDigest).catch(undefined)
  ),
})
