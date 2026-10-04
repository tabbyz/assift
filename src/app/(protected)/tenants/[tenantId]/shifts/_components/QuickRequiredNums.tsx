'use client'

import { useState } from 'react'
import { Alert, Button, Group, NumberInput, Stack, Text } from '@mantine/core'
import { IconUsersGroup } from '@tabler/icons-react'
import { REQUIRED_NUM_MAX, REQUIRED_NUM_MIN } from '@/lib/patterns/requiredNums'

type Props = {
  /** 働く日の勤務（休みは必要人数を持たない） */
  patterns: { id: string; name: string }[]
  onApply: (nums: Record<string, number | ''>) => void
  loading: boolean
}

/**
 * 自動作成で必要人数を聞く口（014 §3.8）。必要人数もデフォルトも 1 件も無いときだけ、
 * 「デフォルト人数をセット」（デフォルトが空だと 0 人が入るだけ）の代わりに出す。
 * 勤務ごとに 1 つ（全曜日共通、既定 1）。曜日ごとの人数は勤務パターンの画面で変える
 */
export function QuickRequiredNums({ patterns, onApply, loading }: Props) {
  const [nums, setNums] = useState<Record<string, number | ''>>(() =>
    Object.fromEntries(patterns.map((pattern) => [pattern.id, 1]))
  )

  return (
    <Alert
      color="gray"
      variant="light"
      icon={<IconUsersGroup size={16} />}
      title="1日に何人ずつ必要ですか？"
    >
      <Stack gap="sm">
        <Text size="sm">
          勤務ごとに入れてください。どの曜日も同じ人数で始めます（曜日ごとの人数はあとで勤務パターンの画面で変えられます）。
        </Text>
        <Group gap="sm">
          {patterns.map((pattern) => (
            <NumberInput
              key={pattern.id}
              label={pattern.name}
              value={nums[pattern.id]}
              onChange={(value) =>
                setNums((prev) => ({ ...prev, [pattern.id]: value === '' ? '' : Number(value) }))
              }
              min={REQUIRED_NUM_MIN}
              max={REQUIRED_NUM_MAX}
              clampBehavior="strict"
              allowDecimal={false}
              allowNegative={false}
              suffix=" 人"
              w={96}
            />
          ))}
        </Group>
        <Group justify="flex-end">
          <Button onClick={() => onApply(nums)} loading={loading}>
            この人数で入れる
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}
