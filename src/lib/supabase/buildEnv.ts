/**
 * Vercel のビルドで Supabase の公開設定が無ければ、ビルドを失敗させる（023 §6）。
 *
 * プレビューのデプロイはブランチを push した時点で作られ、Supabase のブランチ DB の環境変数は PR を作ったあとに
 * Vercel へ同期される。デプロイの環境変数は作った時点のものなので、最初のデプロイはこの 2 つが無いまま組まれうる。
 * `NEXT_PUBLIC_` はビルド時に埋め込まれるので後から届いても効かず、proxy の `getSupabasePublicEnv()` が全リクエストで投げて
 * 素の `Internal Server Error` になる（しかも Vercel の画面では「Ready」）。黙って壊れたデプロイを作るより、ビルドの失敗で知らせる。
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
      'プレビューなら、Supabase のブランチ DB の環境変数が Vercel に届く前にデプロイが作られています。' +
      'PR の Supabase Preview が終わってから、Vercel でこのデプロイを Redeploy してください（023 §6）'
  )
}
