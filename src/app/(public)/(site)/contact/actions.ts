'use server'

import { headers } from 'next/headers'
import { checkBotId } from 'botid/server'
import { ActionError, fail } from '@/lib/actions/error'
import type { ActionResult } from '@/lib/actions/result'
import { runAction } from '@/lib/actions/run'
import { rewriteContactImages } from '@/lib/contact/attachments'
import { contactSubject, contactText, type ContactContext } from '@/lib/contact/render'
import { sendContactEmail } from '@/lib/contact/send'
import { getTenant } from '@/lib/queries/tenants'
import { contactSchema } from '@/lib/validation/contact'
import { getAuthUser } from '@/utils/auth/current'

const SEND_FAILED = '送信できませんでした。時間をおいてもう一度お試しください'

/**
 * お問い合わせを送る（031）。ファイルを受けるので `FormData`（AGENTS.md の例外）。
 *
 * 順番: BotID → Zod → ハニーポット → 添付の書き出し直し → 自動で付ける情報 → Resend。
 * ログインは必須にしない（ログインできない人・導入前の人も使う）。ログイン中はアカウントのアドレスに返す
 */
export async function sendContact(formData: FormData): Promise<ActionResult> {
  return runAction(async () => {
    await assertHuman()

    const input = contactSchema.parse({
      topic: formData.get('topic'),
      email: formData.get('email') ?? undefined,
      body: formData.get('body'),
      requestId: formData.get('requestId'),
      tenantId: formData.get('tenantId') ?? undefined,
      digest: formData.get('digest') ?? undefined,
      honeypot: formData.get('honeypot') ?? undefined,
    })
    // ハニーポット: ボットに判定の手がかりを与えないよう、成功に見せて送らない（031 §4.6）。
    // 自動入力の拡張機能が埋めて人の問い合わせを落とすこともありうるので、ログには残す
    if (input.honeypot) {
      console.warn('[contact] ハニーポットに値があったので送りませんでした')
      return
    }

    const user = await getAuthUser()
    const replyTo = user?.email ?? input.email
    // ログイン中の画面（返信先の欄が無い）から送ったのにセッションが切れていた。欄を出してやり直してもらう
    if (!replyTo) {
      throw new ActionError(
        'ログインの有効期限が切れました。返信先のメールアドレスを入力して、もう一度送信してください',
        'contact_email_required'
      )
    }

    const files = formData.getAll('images').filter((value): value is File => value instanceof File)
    const attachments = await rewriteContactImages(files)

    const context: ContactContext = {
      user: user?.email ? { id: user.id, email: user.email } : undefined,
      // 店舗は RLS で見えたときだけ添える。未ログインなら読まない（見えないので）
      tenant: user && input.tenantId ? await visibleTenant(input.tenantId) : undefined,
      digest: input.digest,
      userAgent: (await headers()).get('user-agent') ?? undefined,
    }

    try {
      await sendContactEmail({
        subject: contactSubject(input.topic, input.body),
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
      fail(SEND_FAILED)
    }
  })
}

/**
 * BotID（031 §4.6）。ボットと判定されたら止める（人が誤判定されたときにやり直せるよう、失敗として返す）。
 * 判定そのものが失敗したとき（Vercel の外・OIDC の設定漏れ・通信）は通す: 問い合わせを取りこぼすほうが困り、
 * ハニーポットと回数の制限は残る。開発（`NODE_ENV !== 'production'`）では BotID が常に人と答える
 */
async function assertHuman() {
  let isBot: boolean
  try {
    isBot = (await checkBotId()).isBot
  } catch (error) {
    console.error('[contact] BotID の判定に失敗したので通します', error)
    return
  }
  if (isBot) throw new ActionError(SEND_FAILED)
}

async function visibleTenant(tenantId: string): Promise<ContactContext['tenant']> {
  try {
    const tenant = await getTenant(tenantId)
    return tenant ? { id: tenant.id, name: tenant.name } : undefined
  } catch (error) {
    // 店舗が読めなくても問い合わせは送る（添える情報が 1 つ減るだけ）
    console.error('[contact] 店舗を読めませんでした', error)
    return undefined
  }
}
