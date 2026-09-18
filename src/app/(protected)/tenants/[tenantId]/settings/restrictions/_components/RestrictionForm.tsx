'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Group, NumberInput, Paper, Select, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import {
  RESTRICTION_DAYS_DEFAULT,
  RESTRICTION_DAYS_MAX,
  RESTRICTION_DAYS_MIN,
  RESTRICTION_KIND_LABELS,
  type RestrictionKind,
} from '@/lib/restrictions/kinds'
import type { RawRestrictionInput } from '@/lib/validation/restrictions'
import { LinkButton } from '@/components/LinkButton'
import { createRestriction, updateRestriction } from '../actions'

export type PatternOption = { value: string; label: string }

export type RestrictionFormValues = {
  pattern1Id: string | null
  pattern2Id: string | null
  /** NumberInput の空欄は `''`。Zod が「日数を入力してください」で弾く */
  days: number | ''
}

type Props = {
  tenantId: string
  kind: RestrictionKind
  /** 1 つ目の欄の選択肢（出勤日 + この欄が参照中の id） */
  pattern1Options: PatternOption[]
  /**
   * 2 つ目の欄の選択肢。`deny_pattern_pair` でだけ描くが**必須**にしてある。
   * 省略可にすると、編集画面の呼び出し側が渡し忘れたときに 1 つ目の選択肢へ無言で
   * フォールバックし、「片方が参照する休みパターンをもう片方でも選べる」不具合が型検査を
   * すり抜けて戻ってくる。
   */
  pattern2Options: PatternOption[]
  initial?: RestrictionFormValues & { restrictionId: string }
}

/** 画面の値を、種別ごとに使う項目だけに絞って Action へ渡す形にする（未入力はそのまま送って Zod に弾かせる） */
function toInput(kind: RestrictionKind, values: RestrictionFormValues): RawRestrictionInput {
  switch (kind) {
    case 'deny_pattern_pair':
      return { kind, pattern1Id: values.pattern1Id, pattern2Id: values.pattern2Id }
    case 'max_work_week':
      return { kind, pattern1Id: values.pattern1Id, days: values.days }
    case 'max_work_consecutive':
      return { kind, pattern1Id: values.pattern1Id, days: values.days }
    case 'sat_or_sun_dayoff':
      return { kind }
  }
}

export function RestrictionForm({
  tenantId,
  kind,
  pattern1Options,
  pattern2Options,
  initial,
}: Props) {
  const router = useRouter()
  const isEdit = Boolean(initial)
  const [values, setValues] = useState<RestrictionFormValues>(
    initial ?? { pattern1Id: null, pattern2Id: null, days: RESTRICTION_DAYS_DEFAULT }
  )
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof RestrictionFormValues>(key: K, value: RestrictionFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startTransition(async () => {
      const input = toInput(kind, values)
      const result = initial
        ? await updateRestriction({ tenantId, restrictionId: initial.restrictionId, input })
        : await createRestriction({ tenantId, input })
      if (!result.ok) {
        setError(result.error)
        return
      }
      notifications.show({ message: isEdit ? '更新しました' : '登録しました', color: 'green' })
      router.push(result.data.redirectTo)
    })
  }

  const daysInput = (
    <NumberInput
      aria-label="日数"
      value={values.days}
      onChange={(raw) => set('days', raw === '' ? '' : Number(raw))}
      min={RESTRICTION_DAYS_MIN}
      max={RESTRICTION_DAYS_MAX}
      clampBehavior="strict"
      allowDecimal={false}
      allowNegative={false}
      suffix=" 日"
      required
      w={110}
    />
  )

  const patternSelect = (
    key: 'pattern1Id' | 'pattern2Id',
    { placeholder, clearable }: { placeholder: string; clearable?: boolean }
  ) => (
    <Select
      aria-label="勤務パターン"
      data={key === 'pattern1Id' ? pattern1Options : pattern2Options}
      value={values[key]}
      onChange={(value) => set(key, value)}
      placeholder={placeholder}
      clearable={clearable}
      required={!clearable}
      w={180}
    />
  )

  return (
    <Paper withBorder p="lg">
      <form onSubmit={submit}>
        <Stack gap="md">
          <FormErrorAlert message={error} />

          <Text fw={700}>{RESTRICTION_KIND_LABELS[kind]}</Text>

          {/* v1 の forms/_<kind> と同じ語順で並べる */}
          {kind === 'deny_pattern_pair' && (
            <Group gap="xs" align="center" wrap="wrap">
              {patternSelect('pattern1Id', { placeholder: '選択してください' })}
              <Text size="sm">の翌日は</Text>
              {patternSelect('pattern2Id', { placeholder: '選択してください' })}
              <Text size="sm">にはしない</Text>
            </Group>
          )}

          {kind === 'max_work_week' && (
            <Group gap="xs" align="center" wrap="wrap">
              {patternSelect('pattern1Id', { placeholder: '選択してください' })}
              <Text size="sm">は1週間に</Text>
              {daysInput}
              <Text size="sm">まで</Text>
            </Group>
          )}

          {kind === 'max_work_consecutive' && (
            <Group gap="xs" align="center" wrap="wrap">
              {/* 未指定は「勤務日」全体が対象（v1 の include_blank: "勤務日"） */}
              {patternSelect('pattern1Id', { placeholder: '勤務日', clearable: true })}
              <Text size="sm">は連続で</Text>
              {daysInput}
              <Text size="sm">まで</Text>
            </Group>
          )}

          {kind === 'sat_or_sun_dayoff' && (
            <Text size="sm" c="dimmed">
              設定が必要な項目はありません
            </Text>
          )}

          <Group justify="flex-end">
            {/* v1 と同じ戻り先の作り分け: 登録中は種別選択へ、編集中は一覧へ */}
            <LinkButton
              href={
                isEdit
                  ? `/tenants/${tenantId}/settings/restrictions`
                  : `/tenants/${tenantId}/settings/restrictions/new`
              }
              variant="subtle"
              color="gray"
              // 送信中に押すと、書き込みは走ったまま遷移して通知とエラー表示を取りこぼす
              disabled={isPending}
            >
              キャンセル
            </LinkButton>
            <Button type="submit" loading={isPending}>
              {isEdit ? '更新する' : '登録する'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
