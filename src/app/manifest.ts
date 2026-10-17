import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME } from '@/lib/site/metadata'

/**
 * Web アプリの manifest（028 §2.4）。`/manifest.webmanifest` で配り、`<link rel="manifest">` は Next が書く。ビルド時に静的に作られる。
 *
 * `display: 'browser'`: Android の Chrome の「ホーム画面に追加」はブラウザで開くショートカットになる（standalone は iOS で Safari と cookie が分かれ、
 * Google ログインや Stripe から戻れない恐れがある。iOS 26 は manifest に依らず利用者のトグルで決まる見込み）。
 * アイコンは 027 の `icon.svg` と `apple-icon.png`（白地）。インストールの条件（192 / 512 の PNG）は目指していない
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    display: 'browser',
    lang: 'ja',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  }
}
