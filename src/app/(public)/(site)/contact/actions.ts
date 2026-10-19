'use server'

import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'
import { ZodError } from 'zod'
import { checkBotId } from 'botid/server'
import { ActionError } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { rewriteContactImages } from '@/lib/contact/attachments'
import { contactSubject, contactText, type ContactContext } from '@/lib/contact/render'
import { assertContactMailConfigured, sendContactEmail } from '@/lib/contact/send'
import { readContactTenant } from '@/lib/contact/tenant'
import { CONTACT_SEND_FAILED_MESSAGE, contactSchema } from '@/lib/validation/contact'
import { getAuthUser } from '@/utils/auth/current'

/** 送った返信先（完了の画面に出す） */
export type ContactSent = { replyTo: string }

/**
 * お問い合わせを送る（031）。ファイルを受けるので `FormData`（AGENTS.md の例外）。
 *
 * 順番: BotID → ハニーポット → Zod → 添付の書き出し直し → 自動で付ける情報 → Resend。
 * ログインは必須にしない（ログインできない人・導入前の人も使う）。ログイン中はアカウントのアドレスに返す。
 * 戻り値は実際に使った返信先（画面の完了の文に出す。描画と送信のあいだにログインの状態が変わっても食い違わない）
 */
export async function sendContact(formData: FormData): Promise<ActionResult<ContactSent>> {
  return runAction(() => toSendFailure(() => send(formData)))
}

/** 本体（`toSendFailure` が想定外の例外を「送れなかった」にそろえる） */
async function send(formData: FormData): Promise<ContactSent> {
  // BotID の判定（Vercel への問い合わせ）とログインの確かめは独立なので並べる。ボットならここで止まり、ほかは何もしない
  const [, user] = await Promise.all([assertHuman(), getAuthUser()])

  // ハニーポット: ボットに判定の手がかりを与えないよう、入力の検証より先に見て、成功に見せて送らない（031 §4.6）。
  // 自動入力の拡張機能が埋めて人の問い合わせを落とすこともありうるので、ログには残す
  const honeypot = formData.get('honeypot')
  if (typeof honeypot === 'string' && honeypot !== '') {
    console.warn('[contact] ハニーポットに値があったので送りませんでした')
    const email = formData.get('email')
    return { replyTo: typeof email === 'string' && email !== '' ? email : (user?.email ?? '') }
  }

  const input = contactSchema.parse({
    topic: formData.get('topic'),
    email: formData.get('email') ?? undefined,
    body: formData.get('body'),
    requestId: formData.get('requestId'),
    tenantId: formData.get('tenantId') ?? undefined,
    digest: formData.get('digest') ?? undefined,
  })

  // 返信先は、入力されたアドレス（未ログインの画面）を優先する。描画のあとに別のタブでログインしても、入力したアドレスに返す
  const replyTo = input.email ?? user?.email
  // 返信先が無い: ログイン中の画面（返信先の欄が無い）から送ったのにセッションが切れていた・アカウントにアドレスが無い。
  // 欄を出してやり直してもらう（未ログインの画面なら欄は必須なので、ふつうは起きない）
  if (!replyTo) {
    throw new ActionError(
      formData.get('asAccount') === '1' && !user
        ? 'ログインの有効期限が切れました。返信先のメールアドレスを入力して、もう一度送信してください'
        : '返信先のメールアドレスを入力してください',
      'contact_email_required'
    )
  }

  // 送れない設定なら、画像の書き出し（重い）の前に止める
  try {
    assertContactMailConfigured()
  } catch (error) {
    console.error('[contact] 送信の設定がありません', error)
    throw new ActionError(CONTACT_SEND_FAILED_MESSAGE, 'contact_send_failed')
  }

  const files = formData.getAll('images').filter((value): value is File => value instanceof File)
  const attachments = await rewriteContactImages(files)

  const [tenant, requestHeaders] = await Promise.all([
    // 店舗は RLS で見えたときだけ添える。未ログインなら読まない（見えないので）
    user && input.tenantId ? readContactTenant(input.tenantId) : undefined,
    headers(),
  ])
  const context: ContactContext = {
    user: user ? { id: user.id, email: user.email } : undefined,
    tenant,
    digest: input.digest,
    userAgent: requestHeaders.get('user-agent') ?? undefined,
  }

  try {
    await sendContactEmail({
      subject: contactSubject(input.topic, input.body, input.requestId),
      text: contactText({
        topic: input.topic,
        body: input.body,
        replyTo,
        context,
        imageCount: attachments.length,
      }),
      replyTo,
      attachments,
      requestId: input.requestId,
    })
  } catch (error) {
    console.error('[contact] 送信に失敗しました', error)
    throw new ActionError(CONTACT_SEND_FAILED_MESSAGE, 'contact_send_failed')
  }
  return { replyTo }
}

/**
 * 想定外の例外（`sharp`・`headers()`・Supabase など）も「送れなかった」（`contact_send_failed`）にそろえる。画面は code で
 * 代わりのアドレスを案内する（文言の比較で決めない）。入力の誤り（Zod）・意図した失敗（`ActionError`）・Next の制御の例外はそのまま
 */
async function toSendFailure<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    unstable_rethrow(error)
    if (error instanceof ActionError || error instanceof ZodError) throw error
    console.error('[contact] 想定外のエラーで送れませんでした', error)
    throw new ActionError(CONTACT_SEND_FAILED_MESSAGE, 'contact_send_failed')
  }
}

/**
 * BotID（031 §4.6）。ボットと判定されたら止める（人が誤判定されたときにやり直せるよう、失敗として返す）。
 *
 * 判定そのものが失敗したとき（OIDC の設定漏れ・Vercel の障害）は、**Vercel の上では止める**: Server Action はどのパスにも
 * POST で呼べるので、判定が効かないと残る守りはハニーポットだけになる。止めても、画面の失敗の表示がアドレスを案内する（031 §4.3）。
 * Vercel の外（ローカルの `next start`）では判定できないので通す。開発（`NODE_ENV !== 'production'`）では BotID が常に人と答える
 */
async function assertHuman() {
  let isBot: boolean
  try {
    isBot = (await checkBotId()).isBot
  } catch (error) {
    if (process.env.VERCEL) {
      console.error('[contact] BotID の判定に失敗したので止めます', error)
      throw new ActionError(CONTACT_SEND_FAILED_MESSAGE, 'contact_send_failed')
    }
    console.warn('[contact] Vercel の外なので BotID の判定を飛ばします', error)
    return
  }
  if (isBot) throw new ActionError(CONTACT_SEND_FAILED_MESSAGE, 'contact_send_failed')
}
