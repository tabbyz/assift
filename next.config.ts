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
  },
  experimental: {
    optimizePackageImports: ['@mantine/core', '@mantine/hooks'],
  },
}

export default nextConfig
