import { Zen_Kaku_Gothic_New } from 'next/font/google'
import { SiteFooter } from './_components/SiteFooter'
import { SiteHeader } from './_components/SiteHeader'
import classes from './Site.module.css'

/**
 * LP の書体（016 §4.2）。この layout の下だけで読み、アプリの他の画面はシステムフォントのまま。
 * 日本語のグリフは Google Fonts と同じく unicode-range で分割され、使う分だけ読まれる（preload は latin だけ）
 */
const siteFont = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-site',
})

/**
 * LP など、ログイン前に見るページの枠（ヘッダー + フッター）。
 * 公開シフト表（`/share/[code]`）はこのグループの外に置く（全画面の表なので枠を被せない。009 §7.1）
 */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className={`${siteFont.variable} ${classes.site}`}>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  )
}
