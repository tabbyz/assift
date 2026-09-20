'use client'

import { useState, type MouseEvent } from 'react'
import {
  ActionIcon,
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
  Tooltip,
} from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import {
  DAY_KEYS,
  DAY_KEY_LABELS,
  type DayKey,
  dayKeyColor,
  isDayKey,
} from '@/lib/calendar/weekdays'
import {
  fillRequiredNumsForward,
  REQUIRED_NUM_MAX,
  REQUIRED_NUM_MIN,
  type RequiredNumsByDay,
} from '@/lib/patterns/requiredNums'
import styles from './RequiredNumsInput.module.css'

type Props = {
  value: RequiredNumsByDay
  onChange: (value: RequiredNumsByDay) => void
}

/** 曜日 + 祝日の 8 列（v1 の default-required-nums-field）。狭い画面では横スクロールする */
export function RequiredNumsInput({ value, onChange }: Props) {
  const [hovered, setHovered] = useState<DayKey | null>(null)

  const set = (key: DayKey, raw: string | number) => {
    const next = { ...value }
    if (raw === '' || raw === null) {
      delete next[key]
    } else {
      next[key] = typeof raw === 'number' ? raw : Number(raw)
    }
    onChange(next)
  }

  const hoverDay = (event: MouseEvent) => {
    const cell = event.target instanceof Element ? event.target.closest('[data-day]') : null
    const day = cell instanceof HTMLElement ? cell.dataset.day : undefined
    if (day && isDayKey(day)) setHovered(day)
  }

  return (
    <Input.Wrapper
      label="必要スタッフ人数のデフォルト値"
      description="必要人数は「自動アサイン機能」を使用する場合に設定が必要です（デフォルト値を設定しておくとシフト表画面にて一括でセットできるため便利です）"
    >
      <ScrollArea mt={4}>
        <Table
          withTableBorder
          withColumnBorders
          miw={420}
          onMouseOver={hoverDay}
          onMouseLeave={() => setHovered(null)}
        >
          <TableThead>
            <TableTr>
              {DAY_KEYS.map((key, index) => (
                <TableTh
                  key={key}
                  data-day={key}
                  ta="center"
                  className={hovered === key ? `${styles.head} ${styles.hot}` : styles.head}
                >
                  <Text size="sm" fw={700} c={dayKeyColor(key)}>
                    {DAY_KEY_LABELS[key]}
                  </Text>
                  {index < DAY_KEYS.length - 1 && (
                    <Tooltip label="以降の曜日にコピー" withArrow>
                      <ActionIcon
                        type="button"
                        className={styles.copy}
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label={`${DAY_KEY_LABELS[key]}の人数を右の曜日にコピー`}
                        onClick={() => onChange(fillRequiredNumsForward(value, key))}
                      >
                        <IconArrowRight size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </TableTh>
              ))}
            </TableTr>
          </TableThead>
          <TableTbody>
            <TableTr>
              {DAY_KEYS.map((key) => (
                <TableTd key={key} data-day={key} p={0}>
                  <NumberInput
                    className={styles.field}
                    aria-label={`${DAY_KEY_LABELS[key]}曜の必要人数`}
                    value={value[key] ?? ''}
                    onChange={(raw) => set(key, raw)}
                    min={REQUIRED_NUM_MIN}
                    max={REQUIRED_NUM_MAX}
                    clampBehavior="strict"
                    allowDecimal={false}
                    allowNegative={false}
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
