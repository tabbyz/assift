import { CONTACT_TOPICS, type ContactTopic } from '@/lib/validation/contact'

/** 本文の先頭に書く情報（031 §4.4）。サーバーで確かめた値だけを入れる */
export type ContactContext = {
  /** ログイン中のアカウント。未ログインなら無し（メールアドレスの無いアカウントもありうる） */
  user?: { id: string; email: string | null }
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
/** 本文とサーバーで確かめた情報の区切り */
const SEPARATOR = '-'.repeat(40)

/**
 * 改行・タブなどの制御文字を空白 1 つにまとめる（件名は 1 行。ヘッダに改行を入れない）。
 * 文字の向きを変える制御文字（U+200E・U+200F・U+202A〜U+202E・U+2066〜U+2069）も消す（件名の受付番号などの並びを見た目で入れ替えさせない）
 */
function singleLine(value: string): string {
  return value
    .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * コードポイントで切る（サロゲートペアの途中で切らない）。移行の `truncate`（`lib/migration`）と数え方は同じだが、
 * 移行のコードはカットオーバーのあとに消しうるので借りない
 */
function clip(value: string, max: number): string {
  const chars = Array.from(value)
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : value
}

/**
 * 件名: `[お問い合わせ] 種類：内容の先頭 30 文字（#受付番号）`。差出人と宛先はどの問い合わせも同じなので、
 * 受付番号（`requestId` の頭 8 文字）で件名を問い合わせごとに変え、Gmail が別の人の問い合わせを 1 つのスレッドにまとめないようにする（031 §4.5）
 */
export function contactSubject(topic: ContactTopic, body: string, requestId: string): string {
  return `[お問い合わせ] ${CONTACT_TOPICS[topic]}：${clip(singleLine(body), SUBJECT_SNIPPET_LENGTH)}（#${contactReceiptNumber(requestId)}）`
}

/** 受付番号（`requestId` の頭 8 文字）。件名と完了の画面が同じ値を出す */
export function contactReceiptNumber(requestId: string): string {
  return requestId.slice(0, 8)
}

/**
 * 本文（テキストだけ。031 §3-8）。受信箱では差出人が `noreply@` に見えるので、返信先を先頭に書き、問い合わせの文、区切り線、
 * サーバーで確かめた情報の順に並べる。区切り線のあとの情報は返信の引用で相手に戻りうるので、本人の情報だけにする（031 §4.4）。
 *
 * 利用者は問い合わせの文に区切り線と偽の「アカウント: …」を書けるので、本物はいちばん最後の区切り線のあと。
 * アカウントに関わる依頼は、返信先とアカウントのアドレスが一致するかを確かめてから受ける（031 §4.4。運用で守る）
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
    SEPARATOR,
    `種類: ${CONTACT_TOPICS[topic]}`,
  ]
  if (context.user) {
    lines.push(
      context.user.email
        ? `アカウント: ${context.user.email}（ユーザー id: ${context.user.id}）`
        : `アカウント: メールアドレス無し（ユーザー id: ${context.user.id}）`
    )
  } else {
    lines.push('アカウント: 未ログイン')
  }
  if (context.tenant) {
    lines.push(`店舗: ${singleLine(context.tenant.name)}（id: ${context.tenant.id}）`)
  }
  if (context.digest) lines.push(`エラー番号: ${context.digest}`)
  if (imageCount > 0) lines.push(`添付: ${imageCount} 枚`)
  if (context.userAgent) {
    lines.push(`ブラウザ: ${clip(singleLine(context.userAgent), USER_AGENT_MAX_LENGTH)}`)
  }
  return lines.join('\n')
}
