import { truncate } from '@/lib/migration/truncate'
import { CONTACT_TOPICS, type ContactTopic } from '@/lib/validation/contact'

/** 本文の末尾に添える情報（031 §4.4）。サーバーで確かめた値だけを入れる */
export type ContactContext = {
  /** ログイン中のアカウント。未ログインなら無し */
  user?: { id: string; email: string }
  /** RLS で見えた店舗だけ */
  tenant?: { id: string; name: string }
  digest?: string
  userAgent?: string
}

export type ContactEmailInput = {
  topic: ContactTopic
  body: string
  /** 返信先（Reply-To）。ログイン中はアカウントのアドレス */
  replyTo: string
  context: ContactContext
  imageCount: number
}

const SUBJECT_SNIPPET_LENGTH = 30
const USER_AGENT_MAX_LENGTH = 300
const DIVIDER = '-'.repeat(40)

/** 改行・タブなどの制御文字を空白 1 つにまとめる（件名は 1 行。ヘッダに改行を入れない） */
function singleLine(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** コードポイントで切る（サロゲートペアの途中で切らない。数え方は移行の切り詰めと同じ） */
function clip(value: string, max: number): string {
  const t = truncate(value, max)
  return t.truncated ? `${t.value}…` : t.value
}

/** 件名: `[お問い合わせ] 種類：内容の先頭 30 文字`。Gmail が問い合わせごとに別のスレッドにする（031 §4.5） */
export function contactSubject(topic: ContactTopic, body: string): string {
  return `[お問い合わせ] ${CONTACT_TOPICS[topic]}：${clip(singleLine(body), SUBJECT_SNIPPET_LENGTH)}`
}

/**
 * 本文（テキストだけ。031 §3-8）。受信箱では差出人が `noreply@` に見えるので、誰からかを先頭に書く。
 * 末尾の情報は返信の引用で相手に戻りうるので、本人の情報だけにする（031 §4.4）
 */
export function contactText({
  topic,
  body,
  replyTo,
  context,
  imageCount,
}: ContactEmailInput): string {
  const lines = [
    `返信先: ${replyTo}`,
    '',
    body.trim(),
    '',
    DIVIDER,
    `種類: ${CONTACT_TOPICS[topic]}`,
  ]
  if (imageCount > 0) lines.push(`添付: ${imageCount} 枚`)
  lines.push(
    context.user
      ? `アカウント: ${context.user.email}（ユーザー id: ${context.user.id}）`
      : 'アカウント: 未ログイン'
  )
  if (context.tenant)
    lines.push(`店舗: ${singleLine(context.tenant.name)}（id: ${context.tenant.id}）`)
  if (context.digest) lines.push(`エラー番号: ${context.digest}`)
  if (context.userAgent) {
    lines.push(`ブラウザ: ${clip(singleLine(context.userAgent), USER_AGENT_MAX_LENGTH)}`)
  }
  return lines.join('\n')
}
