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
/** 利用者の入力の見出し。ここより上はサーバーが確かめた情報 */
const BODY_HEADING = '---- お問い合わせの内容（利用者の入力。各行の頭に「| 」を付けています） ----'
/** 入力の各行の頭に付ける印。入力の中に見出しや「アカウント: …」の行を書いても、印が付くので区別できる */
const QUOTE = '| '

/** 改行・タブなどの制御文字を空白 1 つにまとめる（件名は 1 行。ヘッダに改行を入れない） */
function singleLine(value: string): string {
  return value
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
  return `[お問い合わせ] ${CONTACT_TOPICS[topic]}：${clip(singleLine(body), SUBJECT_SNIPPET_LENGTH)}（#${requestId.slice(0, 8)}）`
}

/**
 * 本文（テキストだけ。031 §3-8）。受信箱では差出人が `noreply@` に見えるので、誰からかを先頭に書く。
 *
 * **サーバーで確かめた情報を先に、利用者の入力を後に置き、入力の各行の頭に印（`| `）を付ける**: 入力を先に置いたり、
 * 区切り線だけで分けたりすると、入力に区切り線と「アカウント: …」を書いて本物の情報に見せかけられる（他人のアカウントからの依頼に見せる）。
 * 先頭の情報は返信の引用で相手に戻りうるので、本人の情報だけにする（031 §4.4）
 */
export function contactText({
  topic,
  body,
  replyTo,
  context,
  imageCount,
}: ContactEmailInput): string {
  const lines = [`返信先: ${replyTo}`, `種類: ${CONTACT_TOPICS[topic]}`]
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
  lines.push(
    '',
    BODY_HEADING,
    ...body
      .trim()
      .split(/\r\n|\r|\n/)
      .map((line) => `${QUOTE}${line}`)
  )
  return lines.join('\n')
}
