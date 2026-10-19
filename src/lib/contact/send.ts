import 'server-only'
import { createHash } from 'node:crypto'
import { ANNOUNCEMENT_FROM } from '@/lib/announce/content'
import type { ContactAttachment } from './attachments'

const RESEND_EMAILS_URL = 'https://api.resend.com/emails'
/** 認証メール・告知と同じ差出人（024 で検証済み） */
const FROM = ANNOUNCEMENT_FROM
const TIMEOUT_MS = 15_000

export type ContactEmail = {
  subject: string
  text: string
  replyTo: string
  attachments: ContactAttachment[]
  /** フォームを開いたときにクライアントが作る uuid。`Idempotency-Key` の頭に使う（031 §4.5） */
  requestId: string
}

/**
 * お問い合わせを `CONTACT_INBOX`（本番は `support@assift.com`）へ送る（031 §4.5・§4.9）。
 *
 * `RESEND_API_KEY` と `CONTACT_INBOX` の両方があるときだけ送る。開発で無ければ中身をコンソールに出して終える
 * （プレビューから本番の受信箱に届かないよう、値は環境ごとに入れる）。ほかの環境で無ければ投げる。
 * やり直しはしない（失敗は画面に返り、利用者が送り直す。中身が同じなら鍵も同じなので二重には届かない）
 */
export async function sendContactEmail(email: ContactEmail): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const inbox = process.env.CONTACT_INBOX
  if (!apiKey || !inbox) {
    if (process.env.NODE_ENV === 'development') {
      const images = email.attachments.map((a) => `${a.filename}（${a.content.length} バイト）`)
      console.info(
        `[contact] RESEND_API_KEY / CONTACT_INBOX が無いので送らずに表示します\n件名: ${email.subject}\nReply-To: ${email.replyTo}\n添付: ${images.join('、') || 'なし'}\n\n${email.text}`
      )
      return
    }
    throw new Error('RESEND_API_KEY と CONTACT_INBOX を設定してください（031 §4.9）')
  }

  const payload = JSON.stringify({
    from: FROM,
    to: [inbox],
    reply_to: email.replyTo,
    subject: email.subject,
    text: email.text,
    attachments: email.attachments.map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
    })),
  })
  const response = await fetch(RESEND_EMAILS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey(email.requestId, payload),
    },
    body: payload,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (response.ok) return

  // 同じ鍵の送信がまだ処理中（409 concurrent_idempotent_requests）も失敗にする: 先の送信が届くとは限らない。
  // 少し待って送り直せば、先の送信が通っていれば Resend はその応答（200）を返し、二重には届かない
  const body = await response.text()
  throw new Error(`Resend が ${response.status} を返しました: ${body}`)
}

/**
 * `Idempotency-Key`。フォームの 1 回分（`requestId`）と中身の指紋を合わせる。
 * 同じ中身の連打・送り直しは 1 通になり、失敗のあとに内容を直して送ったものは別の 1 通になる
 * （鍵が同じで中身が違うと Resend は 409 で断るので、直した送信が届かなくなるのを避ける）
 */
export function idempotencyKey(requestId: string, payload: string): string {
  return `contact/${requestId}/${createHash('sha256').update(payload).digest('hex')}`
}
