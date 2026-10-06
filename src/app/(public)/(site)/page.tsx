import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { dateRange } from '@/lib/calendar/dateRange'
import { holidaysIn } from '@/lib/calendar/holidays'
import { formatPeriodTitle } from '@/lib/calendar/periodTitle'
import { todayJst } from '@/lib/calendar/today'
import { getAuthUser } from '@/utils/auth/current'
import { DemoSection } from './_components/DemoSection'
import { Faq } from './_components/Faq'
import { Features } from './_components/Features'
import { FinalCta } from './_components/FinalCta'
import { Hero } from './_components/Hero'
import { Pricing } from './_components/Pricing'
import { SetupSteps } from './_components/SetupSteps'
import { StaffView } from './_components/StaffView'
import { demoWeekStart } from './_lib/demoWeek'

export const metadata: Metadata = {
  title: { absolute: 'assift｜シフト表づくりに、もう時間はかけない。' },
  description:
    'アルバイト・パートのシフト表を、スマホでもパソコンでも。スタッフの都合や勤務の上限を守ってAIが下書きを作り、できた表はURLでスタッフに共有できます。スタッフ10人まで無料。',
}

/**
 * LP（016）。ログイン済みなら店舗へ送る（005 の申し送り）。
 * デモは来週の月〜日。祝日はここで解いて日付の配列で渡す（祝日データをクライアントに送らない）
 */
export default async function HomePage() {
  if (await getAuthUser()) redirect('/tenants')

  const range = dateRange('week', 1, demoWeekStart(todayJst()))
  const holidays = holidaysIn(range.dates)

  return (
    <main>
      <Hero />
      <DemoSection
        dates={range.dates}
        holidays={holidays}
        title={formatPeriodTitle('week', range)}
      />
      <Features />
      <StaffView dates={range.dates.slice(3)} holidays={holidays} />
      <SetupSteps />
      <Pricing />
      <Faq />
      <FinalCta />
    </main>
  )
}
