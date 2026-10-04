'use client'

import { useState, type RefObject } from 'react'
import {
  Anchor,
  Group,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS } from '@/lib/calendar/weekdays'
import { asksStartOfWeek } from '@/lib/validation/setup'
import { TENANT_NAME_MAX_LENGTH } from '@/lib/validation/tenants'
import classes from './Setup.module.css'

export type StoreValues = { name: string; shiftCycle: ShiftCycle; startOfWeek: number | null }

type Props = {
  values: StoreValues
  onChange: (values: StoreValues) => void
  headingRef: RefObject<HTMLHeadingElement | null>
}

/** 画面の並び。1ヶ月がいちばん多いので先頭に置き、最初から選んだ状態にする（014 §4.1） */
const CYCLES: { value: ShiftCycle; label: string }[] = [
  { value: 'month', label: '1ヶ月' },
  { value: 'half_month', label: '半月' },
  { value: 'two_week', label: '2週間' },
  { value: 'week', label: '1週間' },
]

/** PC は日〜土の 7 つ。スマホは日曜・月曜を大きく出し、ほかは開いて選ぶ */
const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6] as const
const MAIN_DAYS = [0, 1] as const
const OTHER_DAYS = [2, 3, 4, 5, 6] as const

/** 初期設定のステップ 1: お店のこと（014 §4.1） */
export function StoreStep({ values, onChange, headingRef }: Props) {
  const [showOtherDays, setShowOtherDays] = useState(
    values.startOfWeek !== null && values.startOfWeek >= 2 && values.startOfWeek <= 6
  )
  const set = <K extends keyof StoreValues>(key: K, value: StoreValues[K]) =>
    onChange({ ...values, [key]: value })

  const dayButton = (day: number, label: string) => (
    <UnstyledButton
      key={day}
      className={classes.option}
      aria-pressed={values.startOfWeek === day}
      onClick={() => set('startOfWeek', day)}
    >
      {label}
    </UnstyledButton>
  )

  return (
    <Stack gap="xl">
      <Stack gap={6}>
        <Title order={2} fz={22} ref={headingRef} tabIndex={-1} className={classes.heading}>
          お店について教えてください
        </Title>
        <Text c="dimmed">3つの質問に答えるだけで、シフト表の準備ができます（約3分）。</Text>
      </Stack>

      <TextInput
        label="お店の名前"
        placeholder="例）さくら食堂 駅前店"
        description={`${values.name.length} / ${TENANT_NAME_MAX_LENGTH}文字`}
        inputWrapperOrder={['label', 'input', 'description']}
        maxLength={TENANT_NAME_MAX_LENGTH}
        value={values.name}
        onChange={(event) => set('name', event.currentTarget.value)}
        size="md"
        autoFocus
      />

      <Stack gap={8} role="group" aria-labelledby="setup-cycle-label">
        <Text id="setup-cycle-label" fw={600}>
          シフト表は何日分ずつ作りますか？
        </Text>
        <SimpleGrid cols={4} spacing={6}>
          {CYCLES.map((cycle) => (
            <UnstyledButton
              key={cycle.value}
              className={classes.option}
              aria-pressed={values.shiftCycle === cycle.value}
              onClick={() => set('shiftCycle', cycle.value)}
            >
              {cycle.label}
            </UnstyledButton>
          ))}
        </SimpleGrid>
        <Text size="sm" c="dimmed">
          迷ったら「1ヶ月」。あとで変えても、入れたシフトは消えません。
        </Text>
      </Stack>

      {asksStartOfWeek(values.shiftCycle) && (
        <Stack gap={8} role="group" aria-labelledby="setup-week-label">
          <Text id="setup-week-label" fw={600}>
            何曜日から始まりますか？
          </Text>
          {/* PC: 7 つ並べる */}
          <SimpleGrid cols={7} spacing={6} visibleFrom="md">
            {WEEK_ORDER.map((day) => dayButton(day, WEEKDAY_LABELS[day]))}
          </SimpleGrid>
          {/* スマホ: 日曜・月曜を大きく。ほかは開いて選ぶ */}
          <Stack gap={8} hiddenFrom="md">
            <SimpleGrid cols={2} spacing={8}>
              {MAIN_DAYS.map((day) => dayButton(day, `${WEEKDAY_LABELS[day]}曜日`))}
            </SimpleGrid>
            {showOtherDays ? (
              <SimpleGrid cols={5} spacing={6}>
                {OTHER_DAYS.map((day) => dayButton(day, WEEKDAY_LABELS[day]))}
              </SimpleGrid>
            ) : (
              <Group>
                <Anchor
                  component="button"
                  type="button"
                  size="sm"
                  onClick={() => setShowOtherDays(true)}
                >
                  ほかの曜日から始まる
                </Anchor>
              </Group>
            )}
          </Stack>
        </Stack>
      )}
    </Stack>
  )
}
