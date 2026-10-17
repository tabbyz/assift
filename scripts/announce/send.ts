/**
 * カットオーバーの告知（030）を Resend のバッチで送る。手元から流す（Vercel では動かさない）。
 * 文面は `src/lib/announce/content.ts`、組み立ては `render.ts`、宛先と区切りは `recipients.ts`。
 *
 *   # 文面を確かめる（鍵は要らない）
 *   npm run announce:send -- --preview ~/announce/preview
 *
 *   # 自分宛てに 1 通（029 §3.4-4 の試し送り）
 *   RESEND_API_KEY='…' npm run announce:send -- --to <自分のアドレス> --send
 *
 *   # 本番。--send が無ければ予定を出すだけで送らない。--batches で区切って止まる（030 §6.3-b）
 *   RESEND_API_KEY='…' npm run announce:send -- --input <宛先の CSV> --output <結果の CSV> --batches 10 --send
 *   # 止まったら Resend の Metrics でバウンス率を見て、出てきたコマンド（--from-batch）で続ける
 *
 * tsx は `.env*` を読まない。鍵はコマンドごとに渡す。結果の CSV にはメールアドレスが入るので、リポジトリの外に書く
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import {
  ANNOUNCEMENT,
  ANNOUNCEMENT_CAMPAIGN,
  ANNOUNCEMENT_FROM,
  ANNOUNCEMENT_REPLY_TO,
} from '@/lib/announce/content'
import {
  batchIdempotencyKey,
  buildBatchEmails,
  parseRecipients,
  toBatches,
  type BatchEmail,
  type Recipient,
} from '@/lib/announce/recipients'
import { renderAnnouncementHtml, renderAnnouncementText } from '@/lib/announce/render'
import { toCsv } from '@/lib/billing/migration'

const { values } = parseArgs({
  options: {
    preview: { type: 'string' },
    to: { type: 'string' },
    input: { type: 'string' },
    output: { type: 'string' },
    'from-batch': { type: 'string', default: '1' },
    batches: { type: 'string' },
    'interval-ms': { type: 'string', default: '3000' },
    campaign: { type: 'string', default: ANNOUNCEMENT_CAMPAIGN },
    send: { type: 'boolean', default: false },
  },
})

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const MAX_ATTEMPTS = 5
const RESULT_HEADER = ['batch', 'v1_user_id', 'email', 'resend_id', 'sent_at']

const text = renderAnnouncementText(ANNOUNCEMENT)
const html = renderAnnouncementHtml(ANNOUNCEMENT)
const message = {
  from: ANNOUNCEMENT_FROM,
  replyTo: ANNOUNCEMENT_REPLY_TO,
  subject: ANNOUNCEMENT.subject,
  html,
  text,
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function positiveInteger(name: string, value: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1)
    throw new Error(`--${name} は 1 以上の整数にしてください（${value}）`)
  return n
}

/**
 * 1 回のバッチを送る。429 と 5xx・通信の失敗は同じ `Idempotency-Key` でやり直す（同じ鍵なら Resend は二重に送らない。24 時間）。
 * それ以外の失敗（400・422 など）はやり直さずに投げる
 */
async function postBatch(
  key: string,
  emails: BatchEmail[],
  idempotencyKey?: string
): Promise<string[]> {
  for (let attempt = 1; ; attempt++) {
    let response: Response
    try {
      response = await fetch(RESEND_BATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(emails),
      })
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error
      console.warn(`  通信に失敗しました。やり直します（${attempt}/${MAX_ATTEMPTS}）`)
      await sleep(2000 * attempt)
      continue
    }
    const body = await response.text()
    if (response.ok) {
      const ids =
        (JSON.parse(body) as { data?: { id: string }[] }).data?.map((item) => item.id) ?? []
      if (ids.length !== emails.length) {
        throw new Error(
          `返ってきた id の数（${ids.length}）が送った数（${emails.length}）と違います: ${body}`
        )
      }
      return ids
    }
    const retryable = response.status === 429 || response.status >= 500
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new Error(`Resend が ${response.status} を返しました: ${body}`)
    }
    const retryAfter = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt
    console.warn(
      `  ${response.status}。${Math.round(wait / 1000)} 秒待ってやり直します（${attempt}/${MAX_ATTEMPTS}）`
    )
    await sleep(wait)
  }
}

function requireKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.error('RESEND_API_KEY を設定してください')
    process.exit(1)
  }
  return key
}

function printMessage() {
  console.log(`差出人: ${message.from} / 返信先: ${message.replyTo}`)
  console.log(`件名: ${message.subject}`)
  console.log(
    `HTML ${Buffer.byteLength(html, 'utf8').toLocaleString()} バイト / テキスト ${text.length.toLocaleString()} 文字`
  )
}

async function preview(dir: string) {
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'announcement.txt'), text)
  writeFileSync(join(dir, 'announcement.html'), html)
  printMessage()
  console.log(
    `書き出しました: ${join(dir, 'announcement.txt')} / ${join(dir, 'announcement.html')}`
  )
}

async function sendTest(to: string) {
  printMessage()
  const recipient: Recipient = { v1UserId: 'test', email: to.trim().toLowerCase() }
  if (!values.send) {
    console.log(`${recipient.email} に 1 通送る予定です。送るには --send を付けてください`)
    return
  }
  // 試し送りは何度でも送れるように Idempotency-Key を付けない
  const [id] = await postBatch(requireKey(), buildBatchEmails([recipient], message))
  console.log(`送りました: ${recipient.email}（${id}）`)
}

async function sendAll(input: string, output: string) {
  const { recipients, skipped } = parseRecipients(readFileSync(input, 'utf8'))
  const batches = toBatches(recipients)
  const fromBatch = positiveInteger('from-batch', values['from-batch'] ?? '1')
  const count = values.batches ? positiveInteger('batches', values.batches) : batches.length
  const interval = Number(values['interval-ms'])
  const lastBatch = Math.min(batches.length, fromBatch + count - 1)
  const campaign = values.campaign ?? ANNOUNCEMENT_CAMPAIGN

  printMessage()
  console.log(
    `宛先: ${recipients.length.toLocaleString()} 人（外した行 ${skipped.length}）/ バッチ: 全 ${batches.length}`
  )
  for (const s of skipped)
    console.log(`  外した: ${s.row} 行目 id=${s.v1UserId} ${s.email}（${s.reason}）`)
  if (fromBatch > batches.length) {
    console.log(
      `--from-batch ${fromBatch} は最後のバッチ（${batches.length}）の後です。送るものはありません`
    )
    return
  }
  console.log(
    `今回送る: バッチ ${fromBatch}〜${lastBatch}（${batchIdempotencyKey(campaign, fromBatch)} から）/ 間隔 ${interval} ms / 結果: ${output}`
  )
  if (!values.send) {
    console.log('予定を出しただけで、送っていません。送るには --send を付けてください')
    return
  }
  if (fromBatch === 1 && existsSync(output)) {
    console.error(
      `${output} が既にあります。最初から送るなら別の名前に、続きなら --from-batch を付けてください`
    )
    process.exitCode = 1
    return
  }
  if (!existsSync(output)) writeFileSync(output, toCsv(RESULT_HEADER, []))

  const key = requireKey()
  let sent = 0
  for (let number = fromBatch; number <= lastBatch; number++) {
    const batch = batches[number - 1]
    const idempotencyKey = batchIdempotencyKey(campaign, number)
    let ids: string[]
    try {
      ids = await postBatch(key, buildBatchEmails(batch, message), idempotencyKey)
    } catch (error) {
      console.error(
        `バッチ ${number} で止まりました: ${error instanceof Error ? error.message : error}`
      )
      console.error(
        `直してから、同じ宛先の CSV で --from-batch ${number} を付けて続けてください（24 時間以内なら同じ鍵で二重には送られません）`
      )
      process.exitCode = 1
      return
    }
    const sentAt = new Date().toISOString()
    // 1 回ごとに書く（途中で止まっても、送った分の記録が残る）。見出しは最初に書いた
    const rows = batch.map((recipient, index) => ({
      batch: number,
      v1_user_id: recipient.v1UserId,
      email: recipient.email,
      resend_id: ids[index],
      sent_at: sentAt,
    }))
    appendFileSync(output, toCsv(RESULT_HEADER, rows).split('\n').slice(1).join('\n'))
    sent += batch.length
    console.log(
      `バッチ ${number}/${batches.length}: ${batch.length} 通（今回 ${sent.toLocaleString()} 通）`
    )
    if (number < lastBatch) await sleep(interval)
  }
  if (lastBatch < batches.length) {
    console.log(
      `バッチ ${lastBatch} で区切りました。Resend の Metrics でバウンス率を見てから、--from-batch ${lastBatch + 1} で続けてください`
    )
  } else {
    console.log('すべて送りました')
  }
}

async function main() {
  if (values.preview) return preview(values.preview)
  if (values.to) return sendTest(values.to)
  if (values.input && values.output) return sendAll(values.input, values.output)
  console.error(
    '--preview <dir> / --to <アドレス> / --input <宛先の CSV> --output <結果の CSV> のどれかを指定してください'
  )
  process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
