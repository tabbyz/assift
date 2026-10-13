'use client'

import { ErrorPanel, type ErrorPageProps } from '@/components/ErrorPanel'

/**
 * root layout より下の描画の例外（023）。`(protected)/layout.tsx`・`[tenantId]/layout.tsx` の例外もここに来る
 * （同じ層の layout は境界の外なので、`(protected)` に置くとその layout の例外を受けられない）。
 *
 * 戻り先は `/`。未ログインの訪問者（公開シフト表など）は LP が、ログイン済みは LP の redirect が店舗へ送る（016）
 */
export default function RootError({ error, retry }: ErrorPageProps) {
  return <ErrorPanel error={error} retry={retry} home={{ href: '/', label: 'トップへ戻る' }} />
}
