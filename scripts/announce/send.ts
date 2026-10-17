/**
 * カットオーバーの告知（030）を Resend のバッチで送る。手元から流す（Vercel では動かさない）。
 * 文面は `src/lib/announce/content.ts`、組み立ては `render.ts`、宛先・区切り・続きの位置は `recipients.ts`。
 *
 *   # 文面を確かめる（鍵は要らない）
 *   npm run announce:send -- --preview ~/announce/preview
 *
 *   # 自分宛てに 1 通（029 §3.4-4 の試し送り）
 *   RESEND_API_KEY='…' npm run announce:send -- --to <自分のアドレス> --send
 *
 *   # 本番。--send が無ければ予定を出すだけで送らない。--batches で区切って止まる（030 §6.3-b）。
 *   # 続きは同じコマンドをもう一度流す（結果の CSV から続きの位置を決める）
 *   RESEND_API_KEY='…' npm run announce:send -- --input <宛先の CSV> --output <結果の CSV> --batches 10 --send
 *
 * 結果の CSV のほか、`<結果の CSV>.meta.json`（文面の指紋・git のコミット）と `<結果の CSV>.raw.jsonl`（Resend の生の応答）を書く。
 * どれもメールアドレスや送った証拠を含むので、リポジトリの外に書く。tsx は `.env*` を読まない。鍵はコマンドごとに渡す
 */
import { execSync } from 'node:child_process'
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
  messageDigest,
  parseExcludeList,
  parseRecipients,
  resumePoint,
  toBatches,
  type BatchEmail,
} from '@/lib/announce/recipients'
import { renderAnnouncementHtml, renderAnnouncementText } from '@/lib/announce/render'
import { parseCsv, toCsv } from '@/lib/billing/migration'

const { values } = parseArgs({
  options: {
    preview: { type: 'string' },
    to: { type: 'string' },
    input: { type: 'string' },
    output: { type: 'string' },
    exclude: { type: 'string' },
    batches: { type: 'string' },
    'interval-ms': { type: 'string', default: '3000' },
    campaign: { type: 'string', default: ANNOUNCEMENT_CAMPAIGN },
    send: { type: 'boolean', default: false },
  },
})

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const MAX_ATTEMPTS = 5
const TIMEOUT_MS = 30_000
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
const digest = messageDigest(message)

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function integerOption(name: string, value: string, min: number): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min)
    throw new StopError(`--${name} は ${min} 以上の整数にしてください（${value}）`)
  return n
}

/** 送った版の記録（016-terms §7 の証拠）。文面に未コミットの変更があれば知らせる */
function gitCommit(): string {
  try {
    const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
    const dirty = execSync('git status --porcelain -- src/lib/announce', {
      encoding: 'utf8',
    }).trim()
    return dirty ? `${commit}（src/lib/announce に未コミットの変更あり）` : commit
  } catch {
    return '不明'
  }
}

/** 送れたかもしれないのに記録できなかった（200 の応答が読めない）。続けると二重送信になりうるので、別の文で止める */
class SentButUnrecordedError extends Error {}

/** 送る前に止めて、案内どおりに直せば続けられる失敗 */
class StopError extends Error {}

/**
 * 1 回のバッチを送る。429（上限を除く）・5xx・時間切れ・通信の失敗・`concurrent_idempotent_requests` は同じ `Idempotency-Key` で
 * やり直す（同じ鍵と中身なら Resend は二重に送らず、前の応答を返す。24 時間）。それ以外は投げる
 */
async function postBatch(
  key: string,
  emails: BatchEmail[],
  idempotencyKey: string | undefined,
  rawLog: string | undefined
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
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error
      console.warn(
        `  通信に失敗しました（${error instanceof Error ? error.message : error}）。やり直します（${attempt}/${MAX_ATTEMPTS}）`
      )
      await sleep(2000 * attempt)
      continue
    }
    const body = await response.text()
    if (rawLog) {
      appendFileSync(
        rawLog,
        JSON.stringify({
          at: new Date().toISOString(),
          idempotencyKey,
          status: response.status,
          body,
        }) + '\n'
      )
    }
    if (response.ok) {
      let ids: string[] | undefined
      try {
        ids = (JSON.parse(body) as { data?: { id: string }[] }).data?.map((item) => item.id)
      } catch {
        ids = undefined
      }
      if (!ids || ids.length !== emails.length) {
        throw new SentButUnrecordedError(
          `Resend は 200 を返しましたが、応答から ${emails.length} 通分の id を読めませんでした（生の応答は ${rawLog ?? '残していません'}）`
        )
      }
      return ids
    }
    const name = (() => {
      try {
        return String((JSON.parse(body) as { name?: string }).name ?? '')
      } catch {
        return ''
      }
    })()
    if (name === 'daily_quota_exceeded' || name === 'monthly_quota_exceeded') {
      throw new StopError(
        `Resend の送信の上限に達しました（${name}）。Resend の Billing を見てから続けてください`
      )
    }
    if (name === 'invalid_idempotent_request') {
      throw new StopError(
        '同じ Idempotency-Key で前と中身が違う、と断られました。送り始めたときと文面か宛先が変わっています。送った版（meta.json）に戻すか、Resend のログで未送信を確かめてください'
      )
    }
    const retryable =
      response.status === 429 || response.status >= 500 || name === 'concurrent_idempotent_requests'
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new StopError(`Resend が ${response.status} を返しました: ${body}`)
    }
    const retryAfter = Number(response.headers.get('retry-after'))
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2000 * attempt
    console.warn(
      `  ${response.status}${name ? `（${name}）` : ''}。${Math.round(wait / 1000)} 秒待ってやり直します（${attempt}/${MAX_ATTEMPTS}）`
    )
    await sleep(wait)
  }
}

function requireKey(): string {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new StopError('RESEND_API_KEY を設定してください')
  return key
}

function printMessage() {
  console.log(`差出人: ${message.from} / 返信先: ${message.replyTo}`)
  console.log(`件名: ${message.subject}`)
  console.log(
    `HTML ${Buffer.byteLength(html, 'utf8').toLocaleString()} バイト / テキスト ${text.length.toLocaleString()} 文字 / 文面の指紋 ${digest.slice(0, 12)} / コミット ${gitCommit()}`
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
  const email = to.trim().toLowerCase()
  if (!values.send) {
    console.log(`${email} に 1 通送る予定です。送るには --send を付けてください`)
    return
  }
  // 試し送りは何度でも送れるように Idempotency-Key を付けない。tags は本番と分ける
  const [id] = await postBatch(
    requireKey(),
    buildBatchEmails([{ v1UserId: 'test', email }], message, `${values.campaign}-test`),
    undefined,
    undefined
  )
  console.log(`送りました: ${email}（${id}）`)
}

type Meta = { campaign: string; digest: string; commit: string; startedAt: string }

async function sendAll(input: string, output: string) {
  const campaign = values.campaign ?? ANNOUNCEMENT_CAMPAIGN
  const interval = integerOption('interval-ms', values['interval-ms'] ?? '3000', 0)
  // 宛先・除外・記録を読む段の失敗は、案内の文だけを出して止める（スタックは要らない）
  const { recipients, skipped, batches, next, metaPath, rawLog, ledger } = (() => {
    try {
      const exclude = values.exclude
        ? parseExcludeList(readFileSync(values.exclude, 'utf8'))
        : new Set<string>()
      const { recipients, skipped } = parseRecipients(readFileSync(input, 'utf8'), exclude)
      if (recipients.length === 0) throw new StopError('送る宛先が 0 人です')
      const batches = toBatches(recipients)

      // 続きの位置は結果の CSV から決める（記録と今の宛先の区切りが合わなければ止まる）。文面と送信の識別子も前回と同じでなければ止まる
      const metaPath = `${output}.meta.json`
      const rawLog = `${output}.raw.jsonl`
      const ledger = existsSync(output) ? parseCsv(readFileSync(output, 'utf8')) : []
      const next = resumePoint(
        batches,
        ledger.map((row) => ({ batch: row.batch, email: row.email }))
      )
      if (ledger.length > 0) {
        const meta = existsSync(metaPath)
          ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Meta)
          : undefined
        if (!meta)
          throw new StopError(`${metaPath} がありません。結果の CSV と同じ場所に置いてください`)
        if (meta.campaign !== campaign || meta.digest !== digest) {
          throw new StopError(
            `前回（${meta.startedAt}）と送信の識別子か文面が違います（前回 ${meta.campaign} / ${meta.digest.slice(0, 12)}、今回 ${campaign} / ${digest.slice(0, 12)}）。送った版に戻してから続けてください`
          )
        }
      }
      return { recipients, skipped, batches, next, metaPath, rawLog, ledger }
    } catch (error) {
      throw error instanceof StopError
        ? error
        : new StopError(error instanceof Error ? error.message : String(error))
    }
  })()
  const count = values.batches ? integerOption('batches', values.batches, 1) : batches.length
  const lastBatch = Math.min(batches.length, next + count - 1)

  printMessage()
  console.log(
    `宛先: ${recipients.length.toLocaleString()} 人（外した行 ${skipped.length}）/ バッチ: 全 ${batches.length}`
  )
  for (const s of skipped)
    console.log(`  外した: ${s.row} 行目 id=${s.v1UserId} ${s.email}（${s.reason}）`)
  if (next > batches.length) {
    console.log(`結果の CSV に全 ${batches.length} 回の記録があります。送るものはありません`)
    return
  }
  console.log(
    `今回送る: バッチ ${next}〜${lastBatch}（記録済み ${next - 1} 回）/ 間隔 ${interval} ms / 結果: ${output}`
  )
  if (!values.send) {
    console.log('予定を出しただけで、送っていません。送るには --send を付けてください')
    return
  }

  const key = requireKey()
  if (!existsSync(output)) writeFileSync(output, toCsv(RESULT_HEADER, []))
  // 記録が無いうちは毎回書き直す（最初のバッチの前に止まって文面を直した、を通す）
  if (ledger.length === 0) {
    const meta: Meta = {
      campaign,
      digest,
      commit: gitCommit(),
      startedAt: new Date().toISOString(),
    }
    writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n')
  }

  let sent = 0
  for (let number = next; number <= lastBatch; number++) {
    const batch = batches[number - 1]
    const idempotencyKey = batchIdempotencyKey(
      campaign,
      number,
      batch.map((r) => r.email),
      digest
    )
    let ids: string[]
    try {
      ids = await postBatch(key, buildBatchEmails(batch, message, campaign), idempotencyKey, rawLog)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      if (error instanceof SentButUnrecordedError) {
        console.error(`バッチ ${number}: ${reason}`)
        console.error(
          'このバッチは送れている可能性があります。続ける前に Resend のログで送れたかを確かめ、送れていれば結果の CSV にこのバッチの行を足してください（そのまま流すと、24 時間を過ぎていれば二重に送られます）'
        )
      } else {
        console.error(`バッチ ${number} で止まりました: ${reason}`)
        console.error(
          '直してから、同じコマンドをもう一度流すと、このバッチから続けます（24 時間以内なら同じ鍵で二重には送られません）'
        )
      }
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
      `バッチ ${lastBatch} で区切りました。Resend の Metrics でバウンス率を見てから、同じコマンドで続けてください`
    )
  } else {
    console.log('すべて送りました')
  }
}

async function main() {
  if (values.preview) return preview(values.preview)
  if (values.to) return sendTest(values.to)
  if (values.input && values.output) return sendAll(values.input, values.output)
  throw new StopError(
    '--preview <dir> / --to <アドレス> / --input <宛先の CSV> --output <結果の CSV> のどれかを指定してください'
  )
}

main().catch((error) => {
  console.error(error instanceof StopError ? error.message : error)
  process.exitCode = 1
})
