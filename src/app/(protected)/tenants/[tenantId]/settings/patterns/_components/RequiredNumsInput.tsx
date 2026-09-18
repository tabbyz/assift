'use client'

import {
  Input,
  NumberInput,
  ScrollArea,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
} from '@mantine/core'
import { DAY_KEYS, DAY_KEY_LABELS, type DayKey, dayKeyColor } from '@/lib/calendar/weekdays'
import {
  REQUIRED_NUM_MAX,
  REQUIRED_NUM_MIN,
  type RequiredNumsByDay,
} from '@/lib/patterns/requiredNums'

type Props = {
  value: RequiredNumsByDay
  onChange: (value: RequiredNumsByDay) => void
}

/** 曜日 + 祝日の 8 列（v1 の default-required-nums-field）。狭い画面では横スクロールする */
export function RequiredNumsInput({ value, onChange }: Props) {
  const set = (key: DayKey, raw: string | number) => {
    const next = { ...value }
    if (raw === '' || raw === null) {
      delete next[key]
    } else {
      next[key] = typeof raw === 'number' ? raw : Number(raw)
    }
    onChange(next)
  }

  return (
    <Input.Wrapper
      label="必要スタッフ人数のデフォルト値"
      description="必要人数は「自動アサイン機能」を使用する場合に設定が必要です（デフォルト値を設定しておくとシフト表画面にて一括でセットできるため便利です）"
    >
      <ScrollArea mt={4}>
        <Table withTableBorder withColumnBorders miw={420}>
          <TableThead>
            <TableTr>
              {DAY_KEYS.map((key) => (
                <TableTh key={key} ta="center">
                  <Text size="sm" fw={700} c={dayKeyColor(key)}>
                    {DAY_KEY_LABELS[key]}
                  </Text>
                </TableTh>
              ))}
            </TableTr>
          </TableThead>
          <TableTbody>
            <TableTr>
              {DAY_KEYS.map((key) => (
                <TableTd key={key} p={4}>
                  <NumberInput
                    aria-label={`${DAY_KEY_LABELS[key]}曜の必要人数`}
                    value={value[key] ?? ''}
                    onChange={(raw) => set(key, raw)}
                    min={REQUIRED_NUM_MIN}
                    max={REQUIRED_NUM_MAX}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
                    hideControls
                    styles={{ input: { textAlign: 'center', paddingInline: 4 } }}
                  />
                </TableTd>
              ))}
            </TableTr>
          </TableTbody>
        </Table>
      </ScrollArea>
    </Input.Wrapper>
  )
}
