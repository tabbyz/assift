import type { NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/proxy'

// Next 16 では middleware.ts が proxy.ts に改名された。ロジックは utils/supabase/proxy.ts に置く
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // 静的アセットと画像・フォントは対象外
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|ttf|woff2?)$).*)',
  ],
}
