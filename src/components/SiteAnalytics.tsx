'use client'

import { Analytics, type BeforeSend } from '@vercel/analytics/next'
import { stripQueryAndHash } from '@/lib/analytics/url'

/**
 * モジュールの最上位で 1 回だけ作る。SDK は `beforeSend` を依存にした effect で登録し直すので、
 * インラインの関数だと root layout の描き直し（Server Action の `refresh()` など）のたびに登録がやり直される（025 §4.2）
 */
const beforeSend: BeforeSend = (event) => ({ ...event, url: stripQueryAndHash(event.url) })

/**
 * アクセス解析（Vercel Web Analytics。025）。`beforeSend` は関数なので Server の root layout から渡せず、ここで包む。
 * 読み込むかは root layout が `shouldLoadAnalytics()` で決める。スクリプトは SDK が `useEffect` で `<head>` に足す
 * （同一オリジン。CSP は `'strict-dynamic'` で通る。025 §4.4）
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={beforeSend} />
}
