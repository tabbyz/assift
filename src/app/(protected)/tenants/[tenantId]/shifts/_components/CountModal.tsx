'use client'

import { useMemo, type CSSProperties } from 'react'
import {
  Group,
  Modal,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from '@mantine/core'
import { formatMonthDay } from '@/lib/calendar/dateString'
import type { DateRange } from '@/lib/calendar/dateRange'
import { inkColor, isWhitePattern, tintColor } from '@/lib/patterns/colors'
import { countShifts } from '@/lib/shifts/count'
import type { ShiftMap } from '@/lib/shifts/key'
import classes from './CountModal.module.css'

export type CountPattern = { id: string; name: string; colorHex: string }

/**
 * パターン列の見出し。凡例チップと同じ淡塗り + ink にして、表の色と列を結ぶ。
 * 白いパターンは塗りでも文字色でも差が出ないので、見出しは本文と同じ面のままにする。
 */
function patternHeaderStyle(colorHex: string): CSSProperties | undefined {
  if (isWhitePattern(colorHex)) return undefined
  const background = tintColor(colorHex)
  return {
    backgroundColor: background,
    backgroundImage: `linear-gradient(${background}, ${background})`,
    color: inkColor(colorHex),
  }
}
export type CountStaff = { id: string; name: string }

type Props = {
  range: DateRange
  staffs: CountStaff[]
  patterns: CountPattern[]
  workdayPatternIds: string[]
  shifts: ShiftMap
  onClose: () => void
}

/**
 * アサイン数集計（v1 `shifts/_count.html.slim`）。
 *
 * **サーバーを呼ばず、画面が持っているシフトから数える**（008 §3.7）。
 * アサインした直後に開いても表と一致する。
 */
export function CountModal({ range, staffs, patterns, workdayPatternIds, shifts, onClose }: Props) {
  const dayCount = range.dates.length
  const rows = useMemo(
    () => countShifts(shifts, staffs, new Set(workdayPatternIds), range.dates),
    [shifts, staffs, workdayPatternIds, range.dates]
  )

  return (
    <Modal
      opened
      onClose={onClose}
      size="xl"
      title={
        <Group gap="sm" wrap="nowrap">
          <Text fw={600}>アサイン数集計</Text>
          <Text size="sm" c="dimmed">
            {formatMonthDay(range.start)}〜{formatMonthDay(range.end)}
          </Text>
        </Group>
      }
    >
      {staffs.length === 0 ? (
        <Text c="dimmed" size="sm">
          在籍スタッフが登録されていません
        </Text>
      ) : (
        <>
          <div className={classes.scroller}>
            <Table stickyHeader withTableBorder withColumnBorders className={classes.table}>
              <TableThead>
                <TableTr>
                  <TableTh className={classes.nameCell}>
                    <span className={classes.face} />
                  </TableTh>
                  {/* scope: 数字だけの表なので、支援技術がセルと列見出しを結べるようにする（007 と同じ） */}
                  <TableTh scope="col" className={classes.workdayCell}>
                    <span className={classes.face}>勤務日</span>
                  </TableTh>
                  <TableTh scope="col" className={classes.offCell}>
                    <span className={classes.face}>休み</span>
                  </TableTh>
                  {patterns.map((pattern) => (
                    <TableTh key={pattern.id} scope="col">
                      <span className={classes.face} style={patternHeaderStyle(pattern.colorHex)}>
                        {pattern.name}
                      </span>
                    </TableTh>
                  ))}
                </TableTr>
              </TableThead>
              <TableTbody>
                {rows.map(({ staff, workdays, byPattern }) => (
                  <TableTr key={staff.id}>
                    <TableTh scope="row" className={classes.nameCell}>
                      {staff.name}
                    </TableTh>
                    {/* 0 は空欄にする（v1 と同じ）。「休み」= 日数 − 勤務日 だけは常に出す */}
                    <TableTd ta="center" className={classes.workdayCell}>
                      {workdays || ''}
                    </TableTd>
                    <TableTd ta="center" className={classes.offCell}>
                      {dayCount - workdays}
                    </TableTd>
                    {patterns.map((pattern) => (
                      <TableTd key={pattern.id} ta="center">
                        {byPattern.get(pattern.id) ?? ''}
                      </TableTd>
                    ))}
                  </TableTr>
                ))}
              </TableTbody>
            </Table>
          </div>

          <Text size="xs" c="dimmed" mt="sm">
            休み = 期間の日数 − 勤務日数（未アサインの日を含む）
          </Text>
        </>
      )}
    </Modal>
  )
}
