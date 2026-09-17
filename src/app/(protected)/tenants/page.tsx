import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { listTenants } from '@/lib/queries/tenants'
import { CURRENT_TENANT_COOKIE, pickTenantToOpen } from '@/lib/tenants/currentTenant'

/**
 * 直近に開いた店舗へ送る（v1 の TenantsController#index）。
 *
 * cookie は proxy が記録するが「そのユーザーの店舗か」は見ていないので、
 * ここで RLS 越しの一覧と突き合わせる（他人の店舗 id や削除済みの id は末尾に落ちる）。
 */
export default async function TenantsPage() {
  const tenants = await listTenants()
  if (tenants.length === 0) redirect('/tenants/new')

  const cookieId = (await cookies()).get(CURRENT_TENANT_COOKIE)?.value
  const tenant = pickTenantToOpen(tenants, cookieId)
  redirect(`/tenants/${tenant!.id}`)
}
