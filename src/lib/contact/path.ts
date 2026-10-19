import type { ContactTopic } from '@/lib/validation/contact'

/** お問い合わせのページ（031） */
export const CONTACT_PATH = '/contact'

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
