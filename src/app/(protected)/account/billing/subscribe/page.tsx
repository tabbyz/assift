import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SimpleShell } from '@/components/SimpleShell'
import { isStripeConfigured } from '@/lib/billing/stripe'
import { trialLastDay } from '@/lib/billing/trial'
import { getBillingOverview } from '@/lib/queries/billing'
import { getAuthUser } from '@/utils/auth/current'
import { SubscribeClient } from './_components/SubscribeClient'

export const metadata: Metadata = { title: 'お申し込み内容の確認' }

/** 申し込みの最終確認（特商法 12 条の 6。018 §6・019 §5.4）。ボタンで Stripe の Checkout へ */
export default async function SubscribePage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const overview = await getBillingOverview(user.id)
  // 既に有料なら申し込ませない（二重契約。Action でも断る）
  if (overview.entitlement.kind === 'subscription') redirect('/account/billing')

  return (
    <SimpleShell>
      <SubscribeClient
        activeStaffCount={overview.activeStaffCount}
        trialLastDay={
          overview.entitlement.kind === 'trial' ? trialLastDay(overview.entitlement.trialEnd) : null
        }
        billingAvailable={isStripeConfigured()}
      />
    </SimpleShell>
  )
}
