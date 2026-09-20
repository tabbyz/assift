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
 * **店舗名はタイトルに入れない。** LINE などに URL を貼るとリンクプレビューに出てしまう
 * （v1 の公開ページのタイトルにも店舗名は入っていない）。URL を知っている人だけの前提なので `noindex`。
 */
export const metadata: Metadata = {
  title: 'シフト表',
  robots: { index: false, follow: false },
}

/** 公開シフト表（v1 `SharesController#show`）。未ログインで開ける唯一のシフト表 */
export default async function SharePage({ params }: PageProps<'/share/[code]'>) {
  const { code } = await params

  // 存在しない / 期限切れ / 解除済みはすべて null（理由を出し分けない。009 §3.4）
  const shared = await getSharedShiftTable(code, todayJst())
  if (!shared) notFound()

  // 共有は保存済みの期間そのもの。店舗の作成周期で丸める `dateRange()` は使わない（009 §5.7）
  const dates = datesBetween(shared.start, shared.end)

  return (
    <div className={classes.page}>
      <Group justify="space-between" align="baseline" wrap="nowrap" gap="xs" px="xs" pt="xs" pb={4}>
        {/* 単独で開かれるページなので h1 を置く（上位に見出しが無い） */}
        <Title order={1} size="h5">
          {formatMonthDay(shared.start)} 〜 {formatMonthDay(shared.end)}
        </Title>
        <Text size="sm" c="dimmed" style={{ wordBreak: 'break-all' }}>
          {shared.tenantName}
        </Text>
      </Group>

      <Box className={classes.scroller}>
        <ShareTable
          dates={dates}
          holidays={new Set(holidaysIn(dates))}
          staffs={shared.staffs}
          patternsById={new Map(shared.patterns.map((pattern) => [pattern.id, pattern]))}
          shifts={toShiftMap(shared.shifts)}
          notesByDate={new Map(shared.notes.map((note) => [note.date, note.note]))}
        />
      </Box>

      <Box px="xs">
        <PatternDescriptionList patterns={shared.patterns} />
      </Box>

      <Group justify="center" pb="xs">
        {/* Server Component から Link（関数）を渡さないための LinkAnchor（AGENTS.md の UI 規約） */}
        <LinkAnchor href="/" size="xs" c="dimmed">
          © assift
        </LinkAnchor>
      </Group>
    </div>
  )
}
