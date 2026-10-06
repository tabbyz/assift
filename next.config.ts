import type { NextConfig } from 'next'

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
    ]
  },
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
}

export default nextConfig
