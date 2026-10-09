import { formatYearMonthDay } from '@/lib/calendar/dateString'
import { todayJst } from '@/lib/calendar/today'
import { lookup } from '@/utils/record'

/** 管理画面の日時の表示（JST）。値が無ければ「—」 */

const DATE_TIME = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatJstDate(iso: string | null): string {
  return iso ? formatYearMonthDay(todayJst(new Date(iso))) : '—'
}

export function formatJstDateTime(iso: string | null): string {
  return iso ? DATE_TIME.format(new Date(iso)) : '—'
}

const PROVIDER_LABELS: Record<string, string> = { email: 'メール', google: 'Google' }

/** 登録方法（auth.identities の provider）を並べる */
export function formatProviders(providers: string[]): string {
  if (providers.length === 0) return '—'
  return providers.map((p) => lookup(PROVIDER_LABELS, p) ?? p).join('・')
}
