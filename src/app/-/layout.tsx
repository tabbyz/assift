import type { Metadata } from 'next'

/**
 * 運営者の管理画面（020）。本番は admin.assift.com/-/...（proxy がホストで振り分ける）。
 * ログインページを含むので、ここでは確認しない（`(console)/layout.tsx` と各 page が確かめる）
 */
export const metadata: Metadata = {
  title: { default: 'assift 管理', template: '%s | assift 管理' },
  robots: { index: false, follow: false },
}

export default function AdminLayout({ children }: LayoutProps<'/-'>) {
  return children
}
