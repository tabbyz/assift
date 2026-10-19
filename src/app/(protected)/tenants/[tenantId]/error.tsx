'use client'

import { ErrorPanel, type ErrorPageProps } from '@/components/ErrorPanel'

/**
 * 店舗の page・設定・初期設定の例外（023）。`[tenantId]/layout.tsx`（TenantShell）の内側に出るので、枠のナビから**別の**画面へ移れる。
 * 落ちた画面そのもの（ナビの同じ項目・店舗の切り替えで同じ店舗）へのクライアント遷移では境界が解けない（パスが変わらない）ので、
 * 同じ画面の復旧は「もう一度読み込む」が受け持つ。`/` は直近の店舗（= いま落ちた店舗）へ戻ってくるだけなので「戻る」は出さない。
 * layout 自身の例外はルートの `error.tsx`
 */
export default function TenantError({ error, retry }: ErrorPageProps) {
  return <ErrorPanel error={error} retry={retry} />
}
