'use client'

import { ErrorPanel, type ErrorPageProps } from '@/components/ErrorPanel'
import { ADMIN_ROOT } from '@/lib/admin/paths'

/**
 * 管理画面の例外（023）。管理画面のホストでは `/` が 404 なので、戻り先を管理画面にする（`/-` はユーザー一覧へ、未ログインならログインへ送る）。
 * `(console)` の外に置くので、`requireAdminPage()`（`(console)/layout.tsx`）の例外も受ける
 */
export default function AdminError({ error, retry }: ErrorPageProps) {
  return (
    <ErrorPanel
      error={error}
      retry={retry}
      home={{ href: ADMIN_ROOT, label: '管理画面のトップへ' }}
      contact={{ kind: 'email' }}
    />
  )
}
