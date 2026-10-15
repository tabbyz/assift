import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { ColorSchemeScript, mantineHtmlProps } from '@mantine/core'
import { AppProviders } from '@/components/AppProviders'
import { SiteAnalytics } from '@/components/SiteAnalytics'
import { adminHostEnv } from '@/lib/admin/host'
import { shouldLoadAnalytics } from '@/lib/analytics/load'
import { NONCE_HEADER } from '@/lib/security/csp'

export const metadata: Metadata = {
  title: { default: 'assift', template: '%s | assift' },
  description:
    'assift（アシフト）はスマホだけでシフト表の作成・共有ができるシンプルな Web サービスです。',
}

/**
 * ライト専用（ダークモードは作らない）。`only` はブラウザの強制ダーク（Android の Chrome の「ウェブサイトをダークに」・
 * Samsung Internet・アプリ内ブラウザ）に色を変えさせない宣言。ただし Mantine の CSS が `:root` に `color-scheme: light` を
 * 書いてこの meta を上書きするので、`globals.css` でも `only light` に戻す。
 * Mantine の配色は `forceColorScheme="light"`（`ColorSchemeScript` と `AppProviders`）で固定する。`defaultColorScheme` は
 * localStorage の `mantine-color-scheme-value` が優先され、`dark` が残っていると CSS Modules の色と混ざって崩れる（014 §10.10）
 */
export const viewport: Viewport = { colorScheme: 'only light' }

/**
 * CSP の nonce（022）は proxy がリクエストごとに作り、`x-nonce` を**常に上書きする**ので、ここで読む値はクライアントが送ったものではない
 * （proxy を通らないのは静的ファイルと Webhook / cron だけで、HTML を描かない）。`headers()` を読むのでこの下の全ルートが動的描画になる
 * （nonce はビルド時の HTML には入れられない。022 §4.2）。Mantine の `<style>` への受け渡しは `AppProviders`。
 *
 * nonce は `AppProviders` の props として Client に渡るので、RSC の flight データ（HTML のインラインスクリプトと Action の応答）に
 * 文字列として入る。ブラウザの nonce hiding（属性は DOM から読めない）はこの経路には効かない。Next のガイドの `<Script nonce>` と同じ
 * 受け入れたトレードオフ（022 §4.5）。マークアップの注入そのものを防ぐ側（React のエスケープ）が第一の守りであることは変わらない
 *
 * アクセス解析（025）は本番の本体のホストだけで描く（管理画面のホストは外す。`shouldLoadAnalytics()`）
 */
export default async function RootLayout({ children }: LayoutProps<'/'>) {
  const requestHeaders = await headers()
  const nonce = requestHeaders.get(NONCE_HEADER) ?? undefined
  assertNonce(nonce)
  const analytics = shouldLoadAnalytics(requestHeaders.get('host'), adminHostEnv())
  return (
    <html lang="ja" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript forceColorScheme="light" nonce={nonce} />
      </head>
      <body>
        <AppProviders nonce={nonce}>{children}</AppProviders>
        {analytics && <SiteAnalytics />}
      </body>
    </html>
  )
}

/**
 * HTML を描くのに nonce が無い = proxy を通っていない（matcher から外れた）か、段が `{ request }` を渡し忘れた。
 * そのページは `<script>` が全部止まるので、黙って壊れるより名指しする: 開発・テストでは例外、本番はログだけ
 * （本番を全ページ 500 にする形にはしない。ページが止まっていればどのみち気付く）。「描画側に届いたか」を直接見るので Next の内部には依らない
 */
function assertNonce(nonce: string | undefined) {
  if (nonce) return
  const message =
    'root layout: CSP の nonce が無い。proxy の matcher から外れているか、段が { request } を渡していない（022）'
  if (process.env.NODE_ENV === 'production') console.error(message)
  else throw new Error(message)
}
