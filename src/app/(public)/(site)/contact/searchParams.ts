import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'
import { CONTACT_TOPIC_KEYS } from '@/lib/validation/contact'

/**
 * お問い合わせの URL 状態（031 §4.2）。どれもアプリの各所のリンク（`contactHref`）が付ける初期値で、画面からは変えない。
 *
 * - `topic`: 種類の初期値（課金の画面からは `billing`）
 * - `tenant`: 開いていた店舗。ログイン中なら Action が RLS で確かめて本文に添える
 * - `digest`: エラー画面のエラー番号
 */
export const contactParsers = {
  topic: parseAsStringLiteral(CONTACT_TOPIC_KEYS),
  tenant: parseAsString,
  digest: parseAsString,
}

export const loadContactSearchParams = createLoader(contactParsers)
