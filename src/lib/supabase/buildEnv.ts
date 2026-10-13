/**
 * Vercel のビルドで Supabase の公開設定が無ければ、ビルドを失敗させる（023 §6）。
 *
 * プレビューの Supabase の環境変数は、Supabase Branching が PR のブランチ DB を作るときに、Vercel へ**そのブランチ専用**の値として入れる
 * （Preview 全体に効く値は無い。Supabase 側の「Preview に同期」はオフのまま）。この書き込みが抜けることがあり（PR #28。Supabase Preview の
 * チェックは成功のまま）、そのブランチのビルドには 2 つとも渡らない。`NEXT_PUBLIC_` はビルド時に埋め込まれるので、
 * proxy の `getSupabasePublicEnv()` が全リクエストで投げて素の `Internal Server Error` になる（しかも Vercel の画面では「Ready」）。
 * 黙って壊れたデプロイを作るより、ビルドの失敗で知らせる。
 *
 * `SUPABASE_SECRET_KEY` は見ない: 実行時に読む値で、無くても壊れるのは公開シフト表などの一部だけ（proxy は止まらない）。
 * Vercel の外（ローカルの `npm run build`）は見ない（`.env.local` が無くても型や組み立ての確認はできる）
 */
const REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const

/** Vercel のビルドで足りない環境変数の名前。Vercel の外では常に空 */
export function missingSupabaseBuildEnv(env: Record<string, string | undefined>): string[] {
  if (env.VERCEL !== '1') return []
  return REQUIRED.filter((name) => !env[name])
}

export function assertSupabaseBuildEnv(env: Record<string, string | undefined>): void {
  const missing = missingSupabaseBuildEnv(env)
  if (missing.length === 0) return
  throw new Error(
    `${missing.join(' / ')} が無いのでビルドを止めます。` +
      'プレビューなら、このブランチ専用の環境変数が Vercel にありません（Supabase Branching がブランチ DB を作るときに入れる）。' +
      'PR を閉じて開き直し、Supabase Preview が終わってから Vercel で Redeploy してください（023 §6）'
  )
}
