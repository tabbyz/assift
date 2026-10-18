import { createHash } from 'node:crypto'
import { parseCsv } from '@/lib/billing/migration'

/**
 * 告知（030）の宛先。v1 の本番から出した CSV（030 §6.5。列は `id,email,current_sign_in_at`。並びは最近ログインした順）を読む。
 * 並びは変えない。続きの位置は結果の CSV（送った記録）から決め、記録と並びが合わなければ止まる（`resumePoint`。030 §6.4）
 */

export type Recipient = { v1UserId: string; email: string }
export type SkippedRecipient = { row: number; v1UserId: string; email: string; reason: string }

/** Resend のバッチの上限（1 回 100 通。030 §6.2） */
export const BATCH_SIZE = 100

/*
 * 送る前の検査（030 §6.4）。Resend は 1 通でも受け付けないアドレスがあるとバッチごと断りうるので、RFC の形（ASCII・ローカル部の
 * 先頭と末尾と連続の「.」なし・ドメインのラベルの規則・英字の TLD）に合うものだけを 100 通のバッチに入れる。
 * 合わないが v1 が受け付けていた形（`[^@\s]+@[^@\s]+`。携帯のキャリアの古い `taro..yamada@docomo.ne.jp` など）は、
 * 移行の対象で実際に届いていた人なので外さず、最後に 1 通ずつ送る（`irregular`。断られてもその 1 通だけ）
 */
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/

/** v1 の Devise の `email_regexp`（`config/initializers/devise.rb`）と同じ。これにも合わなければ送らない */
const V1_EMAIL = /^[^@\s]+@[^@\s]+$/

export function isSendableEmail(email: string): boolean {
  if (email.length > 254) return false
  const at = email.lastIndexOf('@')
  if (at <= 0 || email.indexOf('@') !== at) return false
  const local = email.slice(0, at)
  const labels = email.slice(at + 1).split('.')
  return (
    local.length <= 64 &&
    LOCAL_PART.test(local) &&
    labels.length >= 2 &&
    labels.every((label) => DOMAIN_LABEL.test(label)) &&
    /^[A-Za-z]{2,}$/.test(labels[labels.length - 1])
  )
}

/**
 * @param exclude 送らないアドレス（小文字）。当日に見つかった不達のアドレスや、作り直した一覧で送り済みの人を外すのに使う（`--exclude`）
 */
export function parseRecipients(
  csv: string,
  exclude: ReadonlySet<string> = new Set()
): { recipients: Recipient[]; irregular: Recipient[]; skipped: SkippedRecipient[] } {
  const rows = parseCsv(csv)
  const first = rows[0]
  if (!first)
    throw new Error('宛先の CSV にデータの行がありません（030 §6.5 の出力が空でないか見る）')
  if (!('id' in first) || !('email' in first)) {
    throw new Error('宛先の CSV に id と email の列がありません（030 §6.5 の SQL で出す）')
  }
  const recipients: Recipient[] = []
  const irregular: Recipient[] = []
  const skipped: SkippedRecipient[] = []
  const seen = new Set<string>()
  rows.forEach((row, index) => {
    // 見出しが 1 行目なので、データの行番号は 2 から
    const line = index + 2
    const v1UserId = row.id.trim()
    const email = row.email.trim().toLowerCase()
    if (!V1_EMAIL.test(email)) {
      skipped.push({ row: line, v1UserId, email, reason: 'メールアドレスの形ではない' })
    } else if (exclude.has(email)) {
      skipped.push({ row: line, v1UserId, email, reason: '除外の一覧にある' })
    } else if (seen.has(email)) {
      skipped.push({ row: line, v1UserId, email, reason: '同じアドレスが前の行にある' })
    } else {
      seen.add(email)
      ;(isSendableEmail(email) ? recipients : irregular).push({ v1UserId, email })
    }
  })
  return { recipients, irregular, skipped }
}

/**
 * 送る順のバッチ。RFC の形のアドレスを 100 通ずつ、そのあとに RFC から外れる形を 1 通ずつ（030 §6.4）。
 * `singlesFrom` 番目（1 から）以降が 1 通ずつのバッチ
 */
export function planBatches(
  recipients: Recipient[],
  irregular: Recipient[]
): { batches: Recipient[][]; singlesFrom: number } {
  const batches = toBatches(recipients)
  return {
    batches: [...batches, ...irregular.map((recipient) => [recipient])],
    singlesFrom: batches.length + 1,
  }
}

/** `--exclude` のファイル（`email` の列を持つ CSV。結果の CSV もそのまま渡せる）からアドレスの集合を作る */
export function parseExcludeList(csv: string): Set<string> {
  const rows = parseCsv(csv)
  if (rows[0] && !('email' in rows[0])) throw new Error('除外の CSV に email の列がありません')
  return new Set(rows.map((row) => row.email.trim().toLowerCase()).filter(Boolean))
}

export function toBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size))
  return batches
}

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

/** 文面（件名・HTML・テキスト）の指紋。送った版の記録と、続きで文面が変わっていないかの確かめに使う */
export function messageDigest(message: { subject: string; html: string; text: string }): string {
  return sha256(JSON.stringify([message.subject, message.html, message.text]))
}

/**
 * バッチの `Idempotency-Key`（24 時間有効。030 §6.2）。番号は 1 から。
 * 宛先と文面の指紋を末尾に入れる: 同じ中身なら同じ鍵（やり直しても二重に送られない）、中身が違えば別の鍵になり、
 * Resend の `invalid_idempotent_request`（同じ鍵で中身が違う）で詰まらない
 */
export function batchIdempotencyKey(
  campaign: string,
  batchNumber: number,
  emails: string[],
  digest: string
): string {
  const fingerprint = sha256([digest, ...emails].join('\n')).slice(0, 12)
  return `${campaign}/batch-${String(batchNumber).padStart(4, '0')}-${fingerprint}`
}

/** 結果の CSV の 1 行（`batch,v1_user_id,email,resend_id,sent_at`） */
export type LedgerRow = { batch: string; email: string }

/**
 * 結果の CSV（送った記録）から続きの位置を決める。記録は 1 番から途切れずに並び、各バッチのアドレスの並びが今の宛先の区切りと
 * 同じでなければならない（宛先の一覧を作り直した・別の CSV を渡した、を止める）。戻り値は次に送るバッチの番号（1 から）
 */
export function resumePoint(batches: Recipient[][], ledger: LedgerRow[]): number {
  const recorded = new Map<number, string[]>()
  for (const row of ledger) {
    const number = Number(row.batch)
    if (!Number.isInteger(number) || number < 1)
      throw new Error(`結果の CSV の batch が不正です（${row.batch}）`)
    const emails = recorded.get(number) ?? []
    emails.push(row.email)
    recorded.set(number, emails)
  }
  const count = recorded.size
  for (let number = 1; number <= count; number++) {
    const emails = recorded.get(number)
    if (!emails)
      throw new Error(`結果の CSV にバッチ ${number} がありません（1 番から途切れずに並ぶはず）`)
    const expected = batches[number - 1]?.map((recipient) => recipient.email) ?? []
    if (emails.length !== expected.length || emails.some((email, i) => email !== expected[i])) {
      throw new Error(
        `結果の CSV のバッチ ${number} が、今の宛先の区切りと合いません。宛先の一覧が送り始めたときと違います（030 §6.4）`
      )
    }
  }
  return count + 1
}

export type BatchEmail = {
  from: string
  to: string[]
  reply_to: string
  subject: string
  html: string
  text: string
  tags: { name: string; value: string }[]
}

/** バッチの中身。**1 通に宛先は 1 人**（`to` に並べると互いのアドレスが見える。030 §6.2）。tags で告知だけを Resend で絞れる */
export function buildBatchEmails(
  recipients: Recipient[],
  message: { from: string; replyTo: string; subject: string; html: string; text: string },
  campaign: string
): BatchEmail[] {
  return recipients.map((recipient) => ({
    from: message.from,
    to: [recipient.email],
    reply_to: message.replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    tags: [{ name: 'campaign', value: campaign }],
  }))
}
