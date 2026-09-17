import 'server-only'
import type { Tables } from '@/types/database'
import { createClient } from '@/utils/supabase/server'

export type Profile = Tables<'profiles'>

/** 自分の profile を 1 行読む。RLS（profiles_select_own）で自分の行しか見えない */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  if (error) throw error
  return data
}
