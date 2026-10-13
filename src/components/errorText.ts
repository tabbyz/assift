import { CONTACT_EMAIL } from '@/components/billing/contact'

/**
 * エラー画面の文言（023）。`ErrorPanel`（Mantine）と `global-error.tsx`（素の HTML）が共有する。
 * Mantine に依らない素の値だけを置く（global-error は Mantine を読めない）
 */
export const ERROR_TEXT = {
  title: '問題が発生しました',
  description: 'ページを表示できませんでした。時間をおいてもう一度お試しください。',
  retry: 'もう一度読み込む',
  /** メールアドレスの前 */
  contactPrefix: '解決しない場合は ',
  contactEmail: CONTACT_EMAIL,
  /** 問い合わせ先のメールアドレスの後ろ。エラー番号（digest）は Server の例外にだけ付く */
  contactSuffix: (digest: string | undefined) =>
    digest ? ' まで、下のエラー番号を添えてお問い合わせください。' : ' までお問い合わせください。',
  digest: (digest: string) => `エラー番号: ${digest}`,
}

/**
 * エラー番号（digest）。Server の例外にだけ Next が付ける。
 * 境界が受ける値は `Error` とは限らない（Next の型は `unknown`。`throw null` も届く）ので、文字列かまで確かめる
 */
export function errorDigest(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('digest' in error)) return undefined
  return typeof error.digest === 'string' ? error.digest : undefined
}
