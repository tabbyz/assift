import { parseCsv } from '@/lib/billing/migration'

/**
 * 告知（030）の宛先。v1 の本番から出した CSV（030 §6.5。列は `id,email,current_sign_in_at`。並びは最近ログインした順）を読む。
 * 並びは変えない（バッチの番号が `Idempotency-Key` になるので、送り始めたら一覧を作り直さない。030 §6.2）
 */

export type Recipient = { v1UserId: string; email: string }
export type SkippedRecipient = { row: number; v1UserId: string; email: string; reason: string }

/** Resend のバッチの上限（1 回 100 通。030 §6.2） */
export const BATCH_SIZE = 100

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function parseRecipients(csv: string): {
  recipients: Recipient[]
  skipped: SkippedRecipient[]
} {
  const rows = parseCsv(csv)
  const first = rows[0]
  if (first && (!('id' in first) || !('email' in first))) {
    throw new Error('宛先の CSV に id と email の列がありません（030 §6.5 の SQL で出す）')
  }
  const recipients: Recipient[] = []
  const skipped: SkippedRecipient[] = []
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    // 見出しが 1 行目なので、データの行番号は 2 から
    const line = index + 2
    const v1UserId = row.id.trim()
    const email = row.email.trim().toLowerCase()
    if (!EMAIL_PATTERN.test(email)) {
      skipped.push({ row: line, v1UserId, email, reason: 'メールアドレスの形ではない' })
    } else if (seen.has(email)) {
      skipped.push({ row: line, v1UserId, email, reason: '同じアドレスが前の行にある' })
    } else {
      seen.add(email)
      recipients.push({ v1UserId, email })
    }
  })
  return { recipients, skipped }
}

export function toBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

/** バッチの `Idempotency-Key`（24 時間有効。030 §6.2）。番号は 1 から */
export function batchIdempotencyKey(campaign: string, batchNumber: number): string {
  return `${campaign}/batch-${String(batchNumber).padStart(4, '0')}`
}

export type BatchEmail = {
  from: string
  to: string[]
  reply_to: string
  subject: string
  html: string
  text: string
}

/** バッチの中身。**1 通に宛先は 1 人**（`to` に並べると互いのアドレスが見える。030 §6.2） */
export function buildBatchEmails(
  recipients: Recipient[],
  message: { from: string; replyTo: string; subject: string; html: string; text: string }
): BatchEmail[] {
  return recipients.map((recipient) => ({
    from: message.from,
    to: [recipient.email],
    reply_to: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
  }))
}
