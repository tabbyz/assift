'use client'

import { Group, Paper, Stack, Text } from '@mantine/core'
import { PatternDescriptionList } from '@/components/shiftTable/PatternDescriptionList'
import { cellStyle } from '@/components/shiftTable/cellStyle'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { dayOfMonth, wday } from '@/lib/calendar/dateString'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import type { PatternKind } from '@/lib/patterns/kinds'
import { periodLength, previewDates, previewRangeLabel, samplePattern } from '@/lib/setup/preview'
import classes from './Setup.module.css'

export type PreviewPattern = {
  key: string
  name: string
  description: string
  colorHex: string
  kind: PatternKind
}

type TableProps = {
  dates: string[]
  patterns: PreviewPattern[]
  staffNames: string[]
  /** スタッフがまだいないときに並べる仮の名前の数 */
  ghostRows: number
  /** スタッフ列を点線で囲む（ステップ 3） */
  staffActive?: boolean
  staffWidth: number
}

/** 見本の表。マスの色は本物の表と同じ `cellStyle`（下書きの見た目）で塗り、名前も本物と同じく全部出す */
function PreviewTable({
  dates,
  patterns,
  staffNames,
  ghostRows,
  staffActive,
  staffWidth,
}: TableProps) {
  const workdays = patterns.filter((pattern) => pattern.kind === 'workday')
  const dayoffs = patterns.filter((pattern) => pattern.kind === 'dayoff')
  const ghost = staffNames.length === 0
  const names = ghost
    ? Array.from({ length: ghostRows }, (_, i) => `スタッフ ${i + 1}`)
    : staffNames

  return (
    <div className={classes.tableScroll}>
      <table className={classes.table} aria-label="シフト表の見本">
        <thead>
          <tr>
            <th
              className={`${classes.staffCell} ${classes.staffHead}`}
              data-active={staffActive || undefined}
              style={{ width: staffWidth }}
            >
              スタッフ
            </th>
            {dates.map((date) => {
              const w = wday(date)
              const color =
                w === 0
                  ? 'var(--mantine-color-red-7)'
                  : w === 6
                    ? 'var(--mantine-color-blue-7)'
                    : undefined
              return (
                <th key={date} style={{ width: 36, color }}>
                  {dayOfMonth(date)}
                  <br />
                  <span style={{ fontWeight: 400 }}>{WEEKDAY_LABELS[w]}</span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {names.map((name, i) => (
            <tr key={`${name}-${i}`}>
              <td className={ghost ? `${classes.staffCell} ${classes.ghost}` : classes.staffCell}>
                {name}
              </td>
              {dates.map((date, j) => {
                const pattern = samplePattern(i, j, workdays, dayoffs)
                return (
                  <td key={date}>
                    {pattern && (
                      <div className={classes.cell} style={cellStyle(pattern, false)}>
                        {pattern.name}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type PreviewProps = {
  storeName: string
  cycle: ShiftCycle
  startOfWeek: number | null
  today: string
  patterns: PreviewPattern[]
  staffNames: string[]
  /** いまのステップ。対応する場所を点線で囲む。完成したら null */
  activeStep: 1 | 2 | 3 | null
}

const PC_DAYS = 14

/** PC の右に出す完成イメージ（014 §4.6）。入力するとその場で変わる */
export function SetupPreview({
  storeName,
  cycle,
  startOfWeek,
  today,
  patterns,
  staffNames,
  activeStep,
}: PreviewProps) {
  const { dates, start, end } = previewDates(cycle, startOfWeek, today, PC_DAYS)
  const length = periodLength(start, end)

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Text size="sm" fw={700} c="dimmed">
          {activeStep === null ? 'あなたのシフト表' : '完成イメージ（入力するとすぐ変わります）'}
        </Text>
        <Text size="xs" c="dimmed">
          マスの中身は見本です
        </Text>
      </Group>

      <div className={classes.zone} data-active={activeStep === 1 || undefined}>
        <Group gap="sm" align="baseline">
          <Text fz={22} fw={700}>
            {storeName.trim() || 'お店の名前'} のシフト表
          </Text>
          <Text size="sm" c="dimmed">
            {previewRangeLabel(start, end)}
            {length > PC_DAYS && `（${PC_DAYS}日目まで表示）`}
          </Text>
        </Group>
      </div>

      <Stack gap={6}>
        <Text size="xs" c="dimmed">
          スタッフは左の列に並びます
        </Text>
        <PreviewTable
          dates={dates}
          patterns={patterns}
          staffNames={staffNames.slice(0, 10)}
          ghostRows={3}
          staffActive={activeStep === 3}
          staffWidth={110}
        />
      </Stack>

      <div className={classes.zone} data-active={activeStep === 2 || undefined}>
        <Stack gap={6} p={4}>
          <Text size="xs" c="dimmed">
            勤務の種類は、マスの色と表の下の説明に出ます
          </Text>
          {patterns.length > 0 ? (
            <Paper withBorder>
              <PatternDescriptionList
                patterns={patterns.map((pattern) => ({ ...pattern, id: pattern.key }))}
              />
            </Paper>
          ) : (
            <Text size="sm" c="dimmed">
              お仕事を選ぶと、ここと表のマスに色がつきます。
            </Text>
          )}
        </Stack>
      </div>
    </Stack>
  )
}

type MiniProps = {
  title: string
  cycle: ShiftCycle
  startOfWeek: number | null
  today: string
  patterns: PreviewPattern[]
  /** 空なら仮の 1 行（「山田」）で勤務の見え方だけを見せる */
  staffNames: string[]
}

/** スマホでステップの下に出す小さな見本（7 日 × 最大 4 人） */
export function SetupMiniPreview({
  title,
  cycle,
  startOfWeek,
  today,
  patterns,
  staffNames,
}: MiniProps) {
  const { dates } = previewDates(cycle, startOfWeek, today, 7)
  return (
    <Paper withBorder p="sm">
      <Stack gap={6}>
        <Text size="sm" fw={700}>
          {title}
        </Text>
        <PreviewTable
          dates={dates}
          patterns={patterns}
          staffNames={staffNames.length > 0 ? staffNames.slice(0, 4) : ['山田']}
          ghostRows={0}
          staffWidth={64}
        />
        <Text size="xs" c="dimmed">
          マスの中身は見本です
        </Text>
      </Stack>
    </Paper>
  )
}
