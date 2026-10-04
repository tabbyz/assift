'use client'

import {
  Chip,
  ChipGroup,
  Group,
  Input,
  NumberInput,
  Select,
  Stack,
  Switch,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableTr,
  Text,
  TextInput,
} from '@mantine/core'
import { DAY_KEYS, DAY_KEY_LABELS, type DayKey, dayKeyColor } from '@/lib/calendar/weekdays'
import {
  MAX_WORK_WEEK_MAX,
  MAX_WORK_WEEK_MIN,
  STAFF_NAME_MAX_LENGTH,
} from '@/lib/validation/staffs'

/**
 * スタッフの入力欄。新規登録（`StaffForm`。2 つを 1 回で送る）と編集（`StaffEditForms`。セクションごとに送る）で共有する
 */

export type StaffPatternOption = { id: string; name: string }

/** 「勤務条件」セクションの値 */
export type StaffConditionValues = {
  availableWdays: number[]
  /** Mantine の NumberInput は空欄を `''` で表す。そのまま Action に渡し、Zod が日本語で弾く */
  maxWorkWeek: number | ''
  availablePatternIds: string[]
  defaultPatterns: Partial<Record<DayKey, string>>
}

export const STAFF_CONDITIONS_DESCRIPTION =
  'AI で作成するときは、勤務できる曜日・選択可能な勤務パターン・週の最大勤務日数を必ず守ります。この人だけの規則は「自動アサイン制約」で設定します。'

export function StaffNameInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <TextInput
      label="名前"
      placeholder="例）山田 太郎"
      description={`${STAFF_NAME_MAX_LENGTH}文字以内で入力`}
      maxLength={STAFF_NAME_MAX_LENGTH}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      required
      autoFocus={autoFocus}
      maw={280}
    />
  )
}

export function StaffConditionFields({
  values,
  onChange,
  patterns,
}: {
  values: StaffConditionValues
  onChange: (values: StaffConditionValues) => void
  patterns: StaffPatternOption[]
}) {
  const set = <K extends keyof StaffConditionValues>(key: K, value: StaffConditionValues[K]) =>
    onChange({ ...values, [key]: value })

  const setAvailableWday = (wday: number, available: boolean) => {
    const rest = values.availableWdays.filter((value) => value !== wday)
    set('availableWdays', available ? [...rest, wday].sort((a, b) => a - b) : rest)
  }

  const setDefaultPattern = (dayKey: DayKey, patternId: string | null) => {
    const next = { ...values.defaultPatterns }
    if (patternId) next[dayKey] = patternId
    else delete next[dayKey]
    set('defaultPatterns', next)
  }

  const patternOptions = patterns.map((pattern) => ({ value: pattern.id, label: pattern.name }))

  return (
    <Stack gap="lg">
      <Input.Wrapper
        label="曜日ごとの勤務"
        description="オフの曜日はシフト表では斜線で表示されます。パターンはシフト表の[ツール]で一括セットでき、AI で作成するときも優先されます"
      >
        <Table mt={4} maw={360} withRowBorders={false} verticalSpacing={4}>
          <TableTbody>
            {DAY_KEYS.map((dayKey) => {
              // 祝日は「勤務できる曜日」の対象外（available_wdays は 0..6）。スイッチを出さない
              const wday = dayKey === 'holiday' ? null : Number(dayKey)
              const available = wday === null || values.availableWdays.includes(wday)
              return (
                <TableTr key={dayKey}>
                  <TableTh w={32} px={0}>
                    <Text
                      size="sm"
                      ta="center"
                      c={dayKeyColor(dayKey)}
                      opacity={available ? 1 : 0.5}
                    >
                      {DAY_KEY_LABELS[dayKey]}
                    </Text>
                  </TableTh>
                  <TableTd w={56}>
                    {wday !== null && (
                      <Switch
                        aria-label={`${DAY_KEY_LABELS[dayKey]}曜に勤務できる`}
                        checked={available}
                        onChange={(event) => setAvailableWday(wday, event.currentTarget.checked)}
                      />
                    )}
                  </TableTd>
                  <TableTd px={0}>
                    {/*
                      勤務できない曜日も選べるままにする: v1 から「勤務できない曜日に休みをデフォルトで入れる」使い方があり、
                      デフォルトのセット（planDefaultPatterns）も勤務できる曜日では絞らない
                    */}
                    <Select
                      aria-label={`${DAY_KEY_LABELS[dayKey]}のデフォルト勤務パターン`}
                      data={patternOptions}
                      value={values.defaultPatterns[dayKey] ?? null}
                      onChange={(value) => setDefaultPattern(dayKey, value)}
                      placeholder={
                        patterns.length === 0
                          ? '勤務パターンが未登録'
                          : available
                            ? '指定なし'
                            : '勤務できない'
                      }
                      disabled={patterns.length === 0}
                      clearable
                    />
                  </TableTd>
                </TableTr>
              )
            })}
          </TableTbody>
        </Table>
      </Input.Wrapper>
      <Input.Wrapper
        label="選択可能な勤務パターン"
        description="選んだパターンだけを、この人に割り当てられます（手動・AI とも）"
      >
        {patterns.length === 0 ? (
          <Text size="sm" c="dimmed" mt={4}>
            勤務パターンが登録されていません
          </Text>
        ) : (
          <ChipGroup
            multiple
            value={values.availablePatternIds}
            onChange={(next) => set('availablePatternIds', next)}
          >
            <Group gap="xs" mt={6}>
              {patterns.map((pattern) => (
                <Chip key={pattern.id} value={pattern.id} size="sm">
                  {pattern.name}
                </Chip>
              ))}
            </Group>
          </ChipGroup>
        )}
      </Input.Wrapper>
      <NumberInput
        label="週の最大勤務日数"
        description="AI で作成するときにアサインされる最大日数です（手動のアサインには影響しません）"
        value={values.maxWorkWeek}
        onChange={(raw) => set('maxWorkWeek', raw === '' ? '' : Number(raw))}
        min={MAX_WORK_WEEK_MIN}
        max={MAX_WORK_WEEK_MAX}
        clampBehavior="strict"
        allowDecimal={false}
        allowNegative={false}
        required
        // ラベルと説明文はフォーム幅のまま。狭いのは入力欄だけ
        styles={{ wrapper: { maxWidth: 120 } }}
      />
    </Stack>
  )
}
