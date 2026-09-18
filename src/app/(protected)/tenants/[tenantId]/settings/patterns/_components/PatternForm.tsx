'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Group,
  Input,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  TextInput,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { PATTERN_KIND_OPTIONS, type PatternKind } from '@/lib/patterns/kinds'
import { DEFAULT_PATTERN_COLOR } from '@/lib/patterns/colors'
import type { RequiredNumsByDay } from '@/lib/patterns/requiredNums'
import { PATTERN_DESCRIPTION_MAX_LENGTH, PATTERN_NAME_MAX_LENGTH } from '@/lib/validation/patterns'
import { LinkButton } from '@/components/LinkButton'
import { createPattern, updatePattern } from '../actions'
import { ColorSwatchPicker } from './ColorSwatchPicker'
import { RequiredNumsInput } from './RequiredNumsInput'

/** ペアの選択肢（自分自身は呼び出し側で除いてある。006 §3.8） */
export type PatternOption = { value: string; label: string }

export type PatternFormValues = {
  name: string
  description: string
  colorHex: string
  kind: PatternKind
  pairPatternId: string | null
  defaultRequiredNums: RequiredNumsByDay
}

type Props = {
  tenantId: string
  pairOptions: PatternOption[]
  /** 編集時の初期値と id。無ければ登録 */
  initial?: PatternFormValues & { patternId: string }
  /**
   * 登録後の挙動。`'reset'` はチュートリアル（入力を空にして続けて登録）、
   * `'list'` は設定画面（一覧へ戻る）。v1 の `tutorial=true` 分岐に相当する（006 §3.5）
   */
  afterCreate: 'reset' | 'list'
}

const emptyValues: PatternFormValues = {
  name: '',
  description: '',
  colorHex: DEFAULT_PATTERN_COLOR,
  kind: 'workday',
  pairPatternId: null,
  defaultRequiredNums: {},
}

export function PatternForm({ tenantId, pairOptions, initial, afterCreate }: Props) {
  const router = useRouter()
  const isEdit = Boolean(initial)
  const [values, setValues] = useState<PatternFormValues>(initial ?? emptyValues)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof PatternFormValues>(key: K, value: PatternFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      if (initial) {
        const result = await updatePattern({ tenantId, patternId: initial.patternId, ...values })
        if (!result.ok) {
          setError(result.error)
          return
        }
        setError(undefined)
        notifications.show({ message: '更新しました', color: 'green' })
        return
      }

      const result = await createPattern({ tenantId, ...values })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setError(undefined)

      if (afterCreate === 'list') {
        notifications.show({ message: '登録しました', color: 'green' })
        router.push(`/tenants/${tenantId}/settings/patterns`)
        return
      }
      // チュートリアル: 同じ画面に留まって続けて登録できるようにする
      setValues(emptyValues)
      notifications.show({
        message: `「${result.data.name}」を登録しました。続けて登録できます`,
        color: 'green',
      })
    })
  }

  return (
    <Paper withBorder p="lg">
      <form onSubmit={submit}>
        <Stack gap="md">
          <FormErrorAlert message={error} />

          <TextInput
            label="パターン名"
            placeholder="例）早番"
            description={`${PATTERN_NAME_MAX_LENGTH}文字以内で入力`}
            maxLength={PATTERN_NAME_MAX_LENGTH}
            value={values.name}
            onChange={(event) => set('name', event.currentTarget.value)}
            required
            autoFocus
            maw={240}
          />

          <TextInput
            label="説明（オプション）"
            description={`必要に応じて${PATTERN_DESCRIPTION_MAX_LENGTH}文字以内でパターンの補足情報を入力（シフト表の下部に表示されます）`}
            maxLength={PATTERN_DESCRIPTION_MAX_LENGTH}
            value={values.description}
            onChange={(event) => set('description', event.currentTarget.value)}
            maw={360}
          />

          <ColorSwatchPicker value={values.colorHex} onChange={(hex) => set('colorHex', hex)} />

          <Input.Wrapper
            label="パターン区分"
            description="勤務日数にカウントしないパターンは「休み」を選択してください（例: [有給]や[夜勤明け]など）"
          >
            <SegmentedControl
              data={PATTERN_KIND_OPTIONS}
              value={values.kind}
              onChange={(value) => set('kind', value as PatternKind)}
              mt={4}
              aria-label="パターン区分"
            />
          </Input.Wrapper>

          {/* 休みパターンに必要人数は無い（保存時も {} に落とす。006 §3.9） */}
          {values.kind === 'workday' && (
            <RequiredNumsInput
              value={values.defaultRequiredNums}
              onChange={(next) => set('defaultRequiredNums', next)}
            />
          )}

          {pairOptions.length > 0 && (
            <Select
              label="ペア勤務パターン"
              description="自動で翌日に特定のパターンを割り当てたい場合に選択します（例: [夜勤] → [明け] など）"
              data={pairOptions}
              value={values.pairPatternId}
              onChange={(value) => set('pairPatternId', value)}
              placeholder="未指定"
              clearable
              maw={240}
            />
          )}

          <Group justify="flex-end">
            {/* チュートリアルでは出さない（v1 の `unless @tutorial_step`） */}
            {afterCreate === 'list' && (
              <LinkButton
                href={`/tenants/${tenantId}/settings/patterns`}
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
