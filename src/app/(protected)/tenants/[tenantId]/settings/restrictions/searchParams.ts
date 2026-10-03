import { createLoader, parseAsString, parseAsStringLiteral } from 'nuqs/server'
import { RESTRICTION_KINDS } from '@/lib/restrictions/kinds'

/**
 * 制約の登録 / 編集の URL 状態（013 §4.2）。
 *
 * - `kind`: 種類（登録画面のカード。未選択は null）。編集画面では使わない（種類は変えられない）
 * - `staffId`: 対象の初期値（スタッフの編集画面の「規則を追加」から来たとき）。在籍でなければ page が捨てる
 * - `from`: `staff` ならキャンセル・保存・削除のあとにスタッフの編集画面へ戻る
 */
export const restrictionFormParsers = {
  kind: parseAsStringLiteral(RESTRICTION_KINDS),
  staffId: parseAsString,
  from: parseAsStringLiteral(['staff'] as const),
}

export const loadRestrictionFormSearchParams = createLoader(restrictionFormParsers)
