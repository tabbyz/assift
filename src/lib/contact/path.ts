import { TERMS } from '@/app/(public)/(site)/terms/_components/terms'
import type { ContactTopic } from '@/lib/validation/contact'

/** お問い合わせのページ（031） */
export const CONTACT_PATH = '/contact'

/**
 * 問い合わせ先のアドレス（規約と同じ）。サイトに出すのは特商法の表記・global-error・管理画面と `/contact` 自身のエラー・
 * お問い合わせのフォームの送信の失敗だけ（ほかはフォームへのリンク。031 §3-1）
 */
export const CONTACT_EMAIL = TERMS.contactEmail

type ContactHrefOptions = {
  /** 開いていた店舗。ログイン中なら Action が RLS で確かめて本文に添える（031 §4.4） */
  tenantId?: string
  /** エラー画面のエラー番号（`error.digest`） */
  digest?: string
  /** 種類の初期値 */
  topic?: ContactTopic
}

/** アプリの各所からお問い合わせのページへのリンク */
export function contactHref({ tenantId, digest, topic }: ContactHrefOptions = {}): string {
  const params = new URLSearchParams()
  if (topic) params.set('topic', topic)
  if (tenantId) params.set('tenant', tenantId)
  if (digest) params.set('digest', digest)
  const query = params.toString()
  return query ? `${CONTACT_PATH}?${query}` : CONTACT_PATH
}
