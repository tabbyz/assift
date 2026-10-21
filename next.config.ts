import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'
import { assertSupabaseBuildEnv } from './src/lib/supabase/buildEnv'

// Vercel のビルドで Supabase の公開設定が無ければ止める（プレビューの最初のデプロイが黙って 500 になるのを防ぐ。023 §6）
assertSupabaseBuildEnv(process.env)

const nextConfig: NextConfig = {
  /**
   * PDF の日本語フォント（010 §3.4）。`@react-pdf/renderer` は外部パッケージとしてネイティブ `require`
   * され、パスも実行時に組み立てるので、Next のトレーサはフォントへの参照を追えない。
   *
   * キーは**ルートの glob**（picomatch）。`[tenantId]` はそのまま書くと文字クラスとして解釈されるので
   * `*` に置き換える（`*` は `/` をまたがない）。値はプロジェクトルートからの glob。
   *
   * **入っていないときの症状は豆腐ではなく 500**（`fontkit.open` の ENOENT）。`npm run build` 後に
   * `.next/server/app/api/.../*.nft.json` を見るのが唯一の事前確認になる。
   */
  outputFileTracingIncludes: {
    '/api/tenants/*/shifts/pdf': ['assets/fonts/**'],
    // 自動アサインのソルバー（012 §5.11）。Server Action はそのページのルートで動くので、キーはシフト表のページ。
    // route group `(protected)` はキーに書かない（実測で効く）。`.wasm` は今のローダーならトレーサも拾うが、
    // 実行時にパスを組んで読むファイルなので、ローダーの書き方が変わっても落ちないよう明示する
    '/tenants/*/shifts': ['node_modules/highs/build/**'],
  },
  /**
   * HiGHS（WASM）の Emscripten ローダーをバンドルしない（`@react-pdf/renderer` と同じ理由）。
   * バンドルすると `.wasm` の位置（パッケージの隣）を解決できなくなる
   */
  serverExternalPackages: ['highs'],
  /**
   * 005 のチュートリアル（`tutorial/*`）は 014 で `/setup` に置き換えた。v1 の旧 URL（proxy が `/tenants/<uuid>/tutorial/...` に
   * 書き換える）も含めて、店舗のトップ（完了ならシフト表、途中なら初期設定）へ送る。
   * 実行順は redirects → proxy なので、v1 のトークン URL は「ここで /tenants/<token>」→「proxy が uuid へ」の 2 回の移動になる
   */
  async redirects() {
    return [
      { source: '/tenants/:id/tutorial/:path*', destination: '/tenants/:id', permanent: true },
      /**
       * v1（Devise）のログイン画面。ブックマークやアドレスバーの補完に残っているはずの URL（005 §12）。
       * 308 にしない: ブラウザが記憶するので、切り替えを v1 に戻すとそのブラウザで v1 のログイン画面へ戻れなくなる。
       * 307 にしない: v1 のフォームは同じパスへ POST するので、開きっぱなしのタブから送ると本文（パスワード）ごと
       * `/login` へ POST し直させる。302 ならブラウザは GET に変える
       */
      { source: '/users/sign_in', destination: '/login', statusCode: 302 },
      /**
       * v1 のアップデート情報。v2 はリリース時に作らない（載せる履歴が無い）ので LP へ送る（005 §13）。
       * 配下（`:path*`）も送る: v1 の配下の URL を確かめられず、v2 は配下にページを持たない。
       * 一時的（307）にする: 後で v2 の `/releases` を作ったとき、ブラウザに記憶された移動が残らないように。
       * v2 の `/releases` を作るときはこの行を消す（`redirects()` は app のページより先に走るので、残すとページに届かない）
       */
      { source: '/releases/:path*', destination: '/', permanent: false },
      /**
       * v1 のカードの更新画面。Stripe の顧客へのメール（カード支払いの失敗）のリンクが v1 の `/card/edit` を指していた（035 §3-8）。
       * カットオーバーの夜に Stripe 上のページへ切り替えるが、それより前に送られたメールのリンクを後から押す人を「プランとお支払い」へ送る
       * （未ログインなら proxy が `/login?next=…` へ送る）。配下（`:path*`）と `/card` 自身も送る。
       * 一時的（307）にする: `/card` を v2 で使うことになったとき、ブラウザに記憶された移動が残らないように。2027-10-30 以降に消してよい
       */
      { source: '/card/:path*', destination: '/account/billing', permanent: false },
    ]
  },
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
    /**
     * お問い合わせの画像の添付（031 §4.7）。既定の 1MB では縮小した画像 3 枚が入らない。**全部の Server Action に効く**
     * （ほかの Action も 4MB までのリクエストを受ける）。Vercel の関数の上限（4.5MB）より小さく、各 Action は Zod で中身を確かめる。
     * 上限は multipart の区切りを含む本文全体に掛かるので、添付の合計は `CONTACT_IMAGES_TOTAL_MAX_BYTES`（3.5MB）に抑えている
     */
    serverActions: { bodySizeLimit: '4mb' },
  },
}

/**
 * Vercel BotID（031 §4.6）。判定のスクリプト（`/149e9513-…/2d206a39-…/a-4-a/c.js`）と送信を、自分のドメインから
 * Vercel へ中継するリライトとヘッダを足す（ブラウザから見て同一オリジンなので CSP の方針は変えない）。
 * このパスは proxy の matcher から外している（`src/proxy.ts`）
 */
export default withBotId(nextConfig)
