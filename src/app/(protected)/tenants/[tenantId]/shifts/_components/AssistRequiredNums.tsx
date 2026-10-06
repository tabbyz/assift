'use client'

import { useState } from 'react'
import { Alert, Button, Group, Stack, Text } from '@mantine/core'
import { IconUsersGroup } from '@tabler/icons-react'
import {
  RequiredNumsMatrix,
  type RequiredNumsMatrixPattern,
} from '@/components/requiredNums/RequiredNumsMatrix'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { toMatrix, toSavePayload } from '@/lib/patterns/requiredNumsMatrix'

type Props = {
  /** 出勤日の勤務（休みは必要人数を持たない） */
  patterns: (RequiredNumsMatrixPattern & { defaultRequiredNums: RequiredNumsByDay })[]
  onSave: (nums: Record<string, RequiredNumsByDay>) => void
  loading: boolean
}

/**
 * AI シフト作成を開いたとき、必要人数が 1 つも決まっていなければその場で聞く（014 §3.8 / 015 §3.5）。
 *
 * 行列は `設定 > 必要人数` と同じ部品。ここでは**どの曜日も同じ人数**（列 1 本）に固定する。
 * 入れた値は基本の人数として保存され、表示中の期間へは解決で届く（焼き付けは起きない）。
 */
export function AssistRequiredNums({ patterns, onSave, loading }: Props) {
  const [matrix, setMatrix] = useState(() => toMatrix(patterns))

  return (
    <Alert
      color="gray"
      variant="light"
      icon={<IconUsersGroup size={16} />}
      title="1日に何人ずつ必要ですか？"
    >
      <Stack gap="sm">
        <Text size="sm">
          勤務ごとに入れてください。どの曜日も同じ人数で始めます（曜日ごとの人数はあとで「必要人数」の設定で変えられます）。
        </Text>
        <RequiredNumsMatrix patterns={patterns} value={matrix} onChange={setMatrix} uniform />
        <Group justify="flex-end">
          <Button onClick={() => onSave(toSavePayload(matrix))} loading={loading}>
            この人数で入れる
          </Button>
        </Group>
      </Stack>
    </Alert>
  )
}
