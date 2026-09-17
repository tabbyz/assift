/** ブラウザにも露出する公開設定。NEXT_PUBLIC_ はビルド時にインライン化されるため直接参照する */
export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY を .env.local に設定してください'
    )
  }
  return { url, key }
}
