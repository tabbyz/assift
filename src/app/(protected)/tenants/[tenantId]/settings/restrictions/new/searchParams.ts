import { createLoader, parseAsStringLiteral } from 'nuqs/server'
import { RESTRICTION_KINDS } from '@/lib/restrictions/kinds'

/** 制約タイプ。未指定（null）なら種別選択カードを出す（006 §3.7） */
export const newRestrictionParsers = {
  kind: parseAsStringLiteral(RESTRICTION_KINDS),
}

export const loadNewRestrictionSearchParams = createLoader(newRestrictionParsers)
