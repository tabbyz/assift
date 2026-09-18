'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Checkbox,
  CheckboxGroup,
  Group,
  Input,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableTr,
  Text,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import {
  DAY_KEYS,
  DAY_KEY_LABELS,
  type DayKey,
  WEEKDAY_LABELS,
  WEEKDAY_VALUES,
  dayKeyColor,
} from '@/lib/calendar/weekdays'
import {
  MAX_WORK_WEEK_MAX,
  MAX_WORK_WEEK_MIN,
  STAFF_NAME_MAX_LENGTH,
} from '@/lib/validation/staffs'
import { LinkButton } from '@/components/LinkButton'
import { createStaff, updateStaff } from '../actions'

export type StaffPatternOption = { id: string; name: string }

export type StaffFormValues = {
  name: string
  availableWdays: number[]
  /** Mantine の NumberInput は空欄を `''` で表す。そのまま Action に渡し、Zod が日本語で弾く */
  maxWorkWeek: number | ''
  availablePatternIds: string[]
  defaultPatterns: Partial<Record<DayKey, string>>
}

type Props = {
  tenantId: string
  patterns: StaffPatternOption[]
  initial?: StaffFormValues & { staffId: string }
  /** 006 §3.5。`'reset'` はチュートリアル、`'list'` は設定画面 */
  afterCreate: 'reset' | 'list'
}

/** v1 の新規フォームは全曜日・全パターンにチェックが入った状態 */
function emptyValues(patterns: StaffPatternOption[]): StaffFormValues {
  return {
    name: '',
    availableWdays: [...WEEKDAY_VALUES],
    maxWorkWeek: 5,
    availablePatternIds: patterns.map((pattern) => pattern.id),
    defaultPatterns: {},
  }
}

export function StaffForm({ tenantId, patterns, initial, afterCreate }: Props) {
  const router = useRouter()
  const isEdit = Boolean(initial)
  const [values, setValues] = useState<StaffFormValues>(initial ?? emptyValues(patterns))
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof StaffFormValues>(key: K, value: StaffFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const setDefaultPattern = (dayKey: DayKey, patternId: string | null) => {
    const next = { ...values.defaultPatterns }
    if (patternId) next[dayKey] = patternId
    else delete next[dayKey]
    set('defaultPatterns', next)
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      if (initial) {
        const result = await updateStaff({ tenantId, staffId: initial.staffId, ...values })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(undefined)
        notifications.show({ message: '更新しました', color: 'green' })
        return
      }

      const result = await createStaff({ tenantId, ...values })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)

      if (afterCreate === 'list') {
        notifications.show({ message: '登録しました', color: 'green' })
        router.push(`/tenants/${tenantId}/settings/staffs`)
        return
      }
      setValues(emptyValues(patterns))
      notifications.show({
        message: `「${result.data.name}」を登録しました。続けて登録できます`,
        color: 'green',
      })
    })
  }

  const patternOptions = patterns.map((pattern) => ({ value: pattern.id, label: pattern.name }))

  return (
    <Paper withBorder p="lg">
      <form onSubmit={submit}>
        <Stack gap="lg">
          <FormErrorAlert message={error} />

          <TextInput
            label="名前"
            placeholder="例）山田 太郎"
            description={`${STAFF_NAME_MAX_LENGTH}文字以内で入力`}
            maxLength={STAFF_NAME_MAX_LENGTH}
            value={values.name}
            onChange={(event) => set('name', event.currentTarget.value)}
            required
            autoFocus
            maw={280}
          />

          <CheckboxGroup
            label="勤務できる曜日"
            value={values.availableWdays.map(String)}
            onChange={(next) => set('availableWdays', next.map(Number))}
          >
            <Group gap="md" mt={4}>
              {WEEKDAY_VALUES.map((wday) => (
                <Checkbox key={wday} value={String(wday)} label={WEEKDAY_LABELS[wday]} />
              ))}
            </Group>
          </CheckboxGroup>

          <Input.Wrapper
            label="デフォルトの勤務パターン"
            description="設定したデフォルトパターンは、シフト表画面の[ツール]ボタンから一括でアサインできます（自動的にはアサインされません）"
          >
            {patterns.length === 0 ? (
              <Text size="sm" c="dimmed" mt={4}>
                勤務パターンが登録されていません
              </Text>
            ) : (
              <Table mt={4} maw={320}>
                <TableTbody>
                  {DAY_KEYS.map((dayKey) => (
                    <TableTr key={dayKey}>
                      <TableTh w={40}>
                        <Text size="sm" c={dayKeyColor(dayKey)}>
                          {DAY_KEY_LABELS[dayKey]}
                        </Text>
                      </TableTh>
                      <TableTd p={4}>
                        <Select
                          aria-label={`${DAY_KEY_LABELS[dayKey]}のデフォルト勤務パターン`}
                          data={patternOptions}
                          value={values.defaultPatterns[dayKey] ?? null}
                          onChange={(value) => setDefaultPattern(dayKey, value)}
                          placeholder="指定なし"
                          clearable
                        />
                      </TableTd>
                    </TableTr>
                  ))}
                </TableTbody>
              </Table>
            )}
          </Input.Wrapper>

          <NumberInput
            label="週の最大勤務日数"
            description="自動シフト作成時にアサインされる最大日数を設定します（手動アサイン時には影響しません）"
            value={values.maxWorkWeek}
            onChange={(raw) => set('maxWorkWeek', raw === '' ? '' : Number(raw))}
            min={MAX_WORK_WEEK_MIN}
            max={MAX_WORK_WEEK_MAX}
            clampBehavior="strict"
            allowDecimal={false}
            allowNegative={false}
            required
            maw={120}
          />

          <CheckboxGroup
            label="選択可能な勤務パターン"
            value={values.availablePatternIds}
            onChange={(next) => set('availablePatternIds', next)}
          >
            {patterns.length === 0 ? (
              <Text size="sm" c="dimmed" mt={4}>
                勤務パターンが登録されていません
              </Text>
            ) : (
              <Group gap="md" mt={4}>
                {patterns.map((pattern) => (
                  <Checkbox key={pattern.id} value={pattern.id} label={pattern.name} />
                ))}
              </Group>
            )}
          </CheckboxGroup>

          <Group justify="flex-end">
            {/* チュートリアルでは出さない（v1 の `unless @tutorial_step`） */}
            {afterCreate === 'list' && (
              <LinkButton
                href={`/tenants/${tenantId}/settings/staffs`}
                variant="subtle"
                color="gray"
                // 送信中に押すと、書き込みは走ったまま遷移して通知とエラー表示を取りこぼす
                disabled={isPending}
              >
                キャンセル
              </LinkButton>
            )}
            <Button type="submit" loading={isPending}>
              {isEdit ? '更新する' : '登録する'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
