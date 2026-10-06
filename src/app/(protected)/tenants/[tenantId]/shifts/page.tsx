import { redirect } from 'next/navigation'
import { shiftsHref } from '@/lib/tenants/navigation'

/**
 * 旧 URL の受け皿（005 §11）。シフト表は店舗のトップ（`/tenants/<uuid>`）に移した。
 *
 * ブックマークと、v1 の店舗 URL から書き換わってきたリンクが着地する。
 * **308 ではなく 307**（`redirect()`）: ログイン必須のページで検索エンジンが見ないため 308 の利点が無く、
 * 恒久キャッシュが残るとあとで `/shifts` を別の意味に使えなくなる（§11.8 の 1）。
 * クエリは `?start=` に限らずまるごと引き継ぐ。
 */
export default async function ShiftsRedirectPage({
  params,
  searchParams,
}: PageProps<'/tenants/[tenantId]/shifts'>) {
  const [{ tenantId }, query] = await Promise.all([params, searchParams])

  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item))
    else if (value !== undefined) search.set(key, value)
  }

  const suffix = search.size > 0 ? `?${search}` : ''
  redirect(`${shiftsHref(tenantId)}${suffix}`)
}
