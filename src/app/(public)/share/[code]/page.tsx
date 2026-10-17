import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Box, Group, Text, Title } from '@mantine/core'
import { LinkAnchor } from '@/components/LinkAnchor'
import { PatternDescriptionList } from '@/components/shiftTable/PatternDescriptionList'
import { datesBetween, formatMonthDay } from '@/lib/calendar/dateString'
import { holidaysIn } from '@/lib/calendar/holidays'
import { todayJst } from '@/lib/calendar/today'
import { getSharedShiftTable } from '@/lib/queries/publicShare'
import { toShiftMap } from '@/lib/shifts/key'
import { ShareTable } from './_components/ShareTable'
import classes from '@/components/shiftTable/ShiftTable.module.css'

/**
 * v1 の「URL共有後に変更したシフトの内容もリアルタイムに反映されます」を設定として書き残す（009 §3.5）。
 * `[code]` は動的セグメントなので既定でも毎回描かれるが、約束事はコードに置く。
 */
export const dynamic = 'force-dynamic'

/**
 * タイトルは固定（v1 の公開ページのタイトルにも店舗名は入っていない）。URL を知っている人だけの前提なので `noindex`。
 * 説明は「店舗名 期間」（ページの見出しと同じ）。LINE は説明が無いと本文の先頭を切り取って出すので、店舗名はどのみちプレビューに出る。
 * それなら出し方を整える（028 §2.3-3。009 の「店舗名をプレビューに出さない」を改めた）。root の LP の宣伝文はスタッフに出さない。
 * 読み取りは page と `cache()` で共有する。`openGraph` は書かない（画像ごと消える）
 */
export async function generateMetadata({ params }: PageProps<'/share/[code]'>): Promise<Metadata> {
  const { code } = await params
  const shared = await getSharedShiftTable(code, todayJst())
  return {
    title: 'シフト表',
    // 見つからないときは page が notFound() するので not-found の metadata が勝つ。ここは打ち消すだけ
    description: shared ? `${shared.tenantName} ${formatPeriod(shared.start, shared.end)}` : null,
    robots: { index: false, follow: false },
  }
}

function formatPeriod(start: string, end: string): string {
  return `${formatMonthDay(start)} 〜 ${formatMonthDay(end)}`
}

/** 公開シフト表（v1 `SharesController#show`）。未ログインで開ける唯一のシフト表 */
export default async function SharePage({ params }: PageProps<'/share/[code]'>) {
  const { code } = await params

  // 存在しない / 期限切れ / 解除済みはすべて null（理由を出し分けない。009 §3.4）
  const today = todayJst()
  const shared = await getSharedShiftTable(code, today)
  if (!shared) notFound()

  // 共有は保存済みの期間そのもの。店舗の作成周期で丸める `dateRange()` は使わない（009 §5.7）
  const dates = datesBetween(shared.start, shared.end)

  return (
    <div className={classes.page}>
      <Group justify="space-between" align="center" wrap="nowrap" gap="xs" px="xs" py={8}>
        {/* 単独で開かれるページなので h1 を置く（上位に見出しが無い） */}
        <Title order={1} size="h5">
          {formatPeriod(shared.start, shared.end)}
        </Title>
        <Text size="sm" c="dimmed" style={{ wordBreak: 'break-all' }}>
          {shared.tenantName}
        </Text>
      </Group>

      <Box className={classes.scroller}>
        <ShareTable
          dates={dates}
          today={today}
          holidays={new Set(holidaysIn(dates))}
          staffs={shared.staffs}
          patternsById={new Map(shared.patterns.map((pattern) => [pattern.id, pattern]))}
          shifts={toShiftMap(shared.shifts)}
          notesByDate={new Map(shared.notes.map((note) => [note.date, note.note]))}
        />
      </Box>

      <PatternDescriptionList
        patterns={shared.patterns}
        end={
          <LinkAnchor href="/" size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            © assift
          </LinkAnchor>
        }
      />
    </div>
  )
}
