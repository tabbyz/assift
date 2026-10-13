import { describe, expect, it } from 'vitest'
import { assertSupabaseBuildEnv, missingSupabaseBuildEnv } from './buildEnv'

const ok = {
  VERCEL: '1',
  NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
}

describe('missingSupabaseBuildEnv', () => {
  it('Vercel のビルドで 2 つとも揃っていれば空', () => {
    expect(missingSupabaseBuildEnv(ok)).toEqual([])
  })

  it('Vercel のビルドで足りない名前を返す（空文字も無いとみなす）', () => {
    expect(missingSupabaseBuildEnv({ VERCEL: '1' })).toEqual([
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ])
    expect(missingSupabaseBuildEnv({ ...ok, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toEqual([
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    ])
  })

  it('Vercel の外（ローカルの build）は見ない', () => {
    expect(missingSupabaseBuildEnv({})).toEqual([])
  })
})

describe('assertSupabaseBuildEnv', () => {
  it('足りなければ名前と直し方を添えて投げる', () => {
    expect(() => assertSupabaseBuildEnv({ VERCEL: '1' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL.*Redeploy/
    )
  })

  it('揃っていれば投げない', () => {
    expect(() => assertSupabaseBuildEnv(ok)).not.toThrow()
  })
})
