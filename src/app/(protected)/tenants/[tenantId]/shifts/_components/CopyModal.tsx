'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Divider,
  Group,
  Modal,
  Stack,
  Text,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { readLocalStorageValue } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { IconArrowNarrowDown, IconBulb } from '@tabler/icons-react'
import { dateRange, prevStart, type DateRange } from '@/lib/calendar/dateRange'
import type { ShiftCycle } from '@/lib/calendar/shiftCycle'
import { copyEnd } from '@/lib/calendar/dateString'
import { MAX_TERM_DAYS, termIssue } from '@/lib/validation/date'
import {
  COPY_TERM_MESSAGES,
  copyConditionsSchema,
  type CopyConditions,
} from '@/lib/validation/shifts'
import { copyShifts } from '../actions'
import { failure, outcome } from '../_lib/notices'
import { MODAL_DATE_PICKER_PROPS } from './datePickerProps'

export type CopyPattern = { id: string; name: string }

type Props = {
  tenantId: string
  cycle: ShiftCycle
  startOfWeek: number
  range: DateRange
  patterns: CopyPattern[]
  onClose: () => void
  /** 実際に行が入ったときだけ呼ぶ。コピー先の開始日が表示期間の外なら、呼び出し側が移動する（008 §3.6） */
  onCopied: (toStart: string) => void
}

const storageKey = (tenantId: string) => `assift:copyShifts:${tenantId}`

/**
 * 前回条件が無いときの既定値（008 §3.6）。
 * v1 は「今月 ← 先月」固定だったが、**表示中の期間 ← その 1 つ前の期間**にする。
 */
function defaultConditions(
  cycle: ShiftCycle,
  startOfWeek: number,
  range: DateRange,
  patterns: CopyPattern[]
): CopyConditions {
  const previous = dateRange(cycle, startOfWeek, prevStart(cycle, range))
  return {
    fromStart: previous.start,
    fromEnd: previous.end,
    toStart: range.start,
    // 何も選ばれていない状態では始めない（v1 も cookie が無いときは全選択）
    patternIds: patterns.map((pattern) => pattern.id),
  }
}

/** 前回条件を検証し、消えた勤務パターンを落とす。壊れていれば既定値に戻す */
function restoreConditions(
  stored: unknown,
  fallback: CopyConditions,
  patterns: CopyPattern[]
): CopyConditions {
  const parsed = copyConditionsSchema.safeParse(stored)
  if (!parsed.success) return fallback

  const existing = new Set(patterns.map((pattern) => pattern.id))
  return { ...parsed.data, patternIds: parsed.data.patternIds.filter((id) => existing.has(id)) }
}

/** 送信が通ったときだけ保存する（v1 の cookie と同じ。開いただけ・キャンセルでは残さない） */
function saveConditions(tenantId: string, conditions: CopyConditions) {
  try {
    window.localStorage.setItem(storageKey(tenantId), JSON.stringify(conditions))
  } catch {
    // プライベートモードなどで書けなくても、コピー自体は済んでいる
  }
}

/**
 * シフトコピー（v1 `shifts/copy/_index.html.slim`）。
 *
 * 日付は `DatePickerInput` の **`dropdownType="modal"`** で選ぶ（`MODAL_DATE_PICKER_PROPS`）。
 * `DateInput`（手入力できる方）だと入力欄にフォーカスした時点でカレンダーが下に開き、勤務パターンの
 * チェックボックスを覆う。その状態でチェックを押すとクリックがカレンダーの日付に吸われ、
 * **コピー先の日付が黙って変わる**（実測。008 §10.4）。
 */
export function CopyModal({
  tenantId,
  cycle,
  startOfWeek,
  range,
  patterns,
  onClose,
  onCopied,
}: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // 前回条件は mount 時に 1 回だけ読む（既定値もそのとき 1 回計算するだけ。開いている間は追わない）。
  // `useLocalStorage` は開いた時点で既定値を書き戻してしまい、
  // 「前回コピーした条件」ではなく「前回開いた期間の既定値」が残る（008 §10.11）
  const [conditions, setConditions] = useState<CopyConditions>(() =>
    restoreConditions(
      readLocalStorageValue({ key: storageKey(tenantId) }),
      defaultConditions(cycle, startOfWeek, range, patterns),
      patterns
    )
  )
  const update = (patch: Partial<CopyConditions>) =>
    setConditions((current) => ({ ...current, ...patch }))

  // 正は Zod（サーバー）。同じ termIssue と同じ文言で、押す前に理由が見えるようにし、直るまで送らせない
  const issue = termIssue(conditions.fromStart, conditions.fromEnd)
  const toEnd =
    issue === 'order' ? null : copyEnd(conditions.fromStart, conditions.fromEnd, conditions.toStart)
  const canSubmit = patterns.length > 0 && conditions.patternIds.length > 0 && issue === null

  // コピー先の開始日は表示期間の中だが終了日がはみ出す（31 日の From を 30 日の月へ）: 移動はしないので通知で伝える
  const spillsOver =
    toEnd !== null &&
    conditions.toStart >= range.start &&
    conditions.toStart <= range.end &&
    toEnd > range.end

  const allChecked = patterns.length > 0 && conditions.patternIds.length === patterns.length

  const submit = () =>
    startTransition(async () => {
      const result = await copyShifts({ tenantId, ...conditions })
      if (!result.ok) {
        notifications.show(failure(result.error))
        router.refresh()
        return
      }
      saveConditions(tenantId, conditions)
      onClose()

      // コピー先がすべて埋まっていたときは緑の成功で流さず、移動もしない（008 §10.7 / §10.11）
      const done = spillsOver
        ? 'シフトをコピーしました（一部は次の期間にあります）'
        : 'シフトをコピーしました'
      notifications.show(
        outcome(
          result.data.inserted,
          done,
          'コピー先がすべてアサイン済みのため、追加したシフトはありません'
        )
      )
      if (result.data.inserted > 0) onCopied(conditions.toStart)
    })

  return (
    <Modal opened onClose={onClose} title="シフトをコピー" size="sm">
      <Stack gap="md">
        <Alert variant="light" color="teal" icon={<IconBulb size={16} />} p="xs">
          <Text size="xs">コピー先がすでにアサイン済みの場合は上書きされません</Text>
        </Alert>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            コピー元 (From) の期間
          </Text>
          <DatePickerInput
            label="開始日"
            value={conditions.fromStart}
            onChange={(value) => value && update({ fromStart: value })}
            {...MODAL_DATE_PICKER_PROPS}
          />
          <DatePickerInput
            label="終了日"
            value={conditions.fromEnd}
            onChange={(value) => value && update({ fromEnd: value })}
            error={issue ? COPY_TERM_MESSAGES[issue] : null}
            {...MODAL_DATE_PICKER_PROPS}
          />
          <Text size="xs" c="dimmed" ta="center">
            ※コピー可能な期間は最大{MAX_TERM_DAYS}日間です
          </Text>
        </Stack>

        <Group justify="center">
          <IconArrowNarrowDown size={28} />
        </Group>

        <Stack gap="xs">
          <Text size="sm" fw={600}>
            コピー先 (To) の期間
          </Text>
          <DatePickerInput
            label="開始日"
            value={conditions.toStart}
            onChange={(value) => value && update({ toStart: value })}
            {...MODAL_DATE_PICKER_PROPS}
          />
          {/*
            v1 は「自動計算」の文字だけだった。コピー元の長さから計算して見せる（008 §3.6）。
            同じ DatePickerInput を readOnly にすれば書式が上と揃い、キーボードと読み上げにも届く
            （disabled にすると外れる）。readOnly の PickerInputBase はカレンダーを開かない。
          */}
          <DatePickerInput
            label="終了日"
            value={toEnd}
            readOnly
            variant="filled"
            {...MODAL_DATE_PICKER_PROPS}
          />
        </Stack>

        <Divider />

        {/*
          勤務パターンが 1 件も無い店舗では、選ぶものが無いのに Zod が
          「コピー対象の勤務パターンを選択してください」と言う行き止まりになる（008 §10.9）。
          理由を書いて送信できないようにする
        */}
        {patterns.length === 0 ? (
          <Text size="sm" c="dimmed">
            勤務パターンが登録されていないため、コピーできません
          </Text>
        ) : (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              コピー対象の勤務パターン
            </Text>
            <Checkbox
              label="すべて"
              c="dimmed"
              checked={allChecked}
              indeterminate={!allChecked && conditions.patternIds.length > 0}
              onChange={(event) =>
                update({
                  patternIds: event.currentTarget.checked
                    ? patterns.map((pattern) => pattern.id)
                    : [],
                })
              }
            />
            <CheckboxGroup
              value={conditions.patternIds}
              onChange={(patternIds) => update({ patternIds })}
            >
              <Stack gap={4} pl="md">
                {patterns.map((pattern) => (
                  <Checkbox key={pattern.id} value={pattern.id} label={pattern.name} />
                ))}
              </Stack>
            </CheckboxGroup>
          </Stack>
        )}

        <Group justify="flex-end">
          <Button onClick={submit} loading={isPending} disabled={!canSubmit}>
            シフトをコピー
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
