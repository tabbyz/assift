// 003 で `npx supabase gen types typescript --local > src/types/database.ts` の出力に置き換える。
// それまでは CLI の出力と同じ形の空定義を置く。手書きで拡張しない。

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: Record<string, never>
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
