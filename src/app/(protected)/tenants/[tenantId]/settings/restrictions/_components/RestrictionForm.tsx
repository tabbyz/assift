'use client'

import { type FormEvent, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Group,
  Input,
  NumberInput,
  Radio,
  RadioGroup,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { FormErrorAlert } from '@/components/FormErrorAlert'
import { LinkButton } from '@/components/LinkButton'
import { SettingsSection } from '@/components/SettingsSection'
import { SHIFT_CYCLE_UNITS, type ShiftCycle } from '@/lib/calendar/shiftCycle'
import { WEEKDAY_LABELS, WEEKDAY_VALUES } from '@/lib/calendar/weekdays'
import {
  defaultHard,
  hasStrengthChoice,
  PREFER_DAYOFF_WDAYS_MAX,
  RESTRICTION_DAYS_DEFAULT,
  RESTRICTION_DAYS_MIN,
  RESTRICTION_KINDS,
  RESTRICTION_KIND_EXAMPLES,
  RESTRICTION_KIND_LABELS,
  type RestrictionKind,
  requiresWorkdayPattern,
  restrictionDaysMax,
} from '@/lib/restrictions/kinds'
import { lowerBoundWarning } from '@/lib/restrictions/warnings'
import type { RawRestrictionInput } from '@/lib/validation/restrictions'
import type { Tables } from '@/types/database'
import { restrictionFormParsers } from '../searchParams'
import { createRestriction, updateRestriction } from '../actions'

export type PatternOption = { value: string; label: string }

export type RestrictionStaffOption = Pick<
  Tables<'staffs'>,
  'id' | 'name' | 'max_work_week' | 'available_wdays'
>

export type RestrictionFormValues = {
  /** null = 店舗全体 */
  staffId: string | null
  pattern1Id: string | null
  pattern2Id: string | null
  /** NumberInput の空欄は `''`。Zod が「日数を入力してください」で弾く */
  days: number | ''
  wdays: number[]
}

type Props = {
  tenantId: string
  cycle: ShiftCycle
  /** 対象に選べる在籍スタッフ（表示順）。明らかに守れない下限の注意にも使う */
  staffs: RestrictionStaffOption[]
  /** 1 つ目の欄の選択肢（出勤日 + この欄が参照中の id） */
  pattern1Options: PatternOption[]
  /**
   * 2 つ目の欄の選択肢。`deny_pattern_pair` でだけ描くが**必須**にしてある。
   * 省略可にすると、編集画面の呼び出し側が渡し忘れたときに 1 つ目の選択肢へ無言で
   * フォールバックし、「片方が参照する休みパターンをもう片方でも選べる」不具合が型検査を
   * すり抜けて戻ってくる。
   */
  pattern2Options: PatternOption[]
  /** 新規の対象の初期値（`?staffId=`）。在籍でなければ呼び出し側が null にする */
  initialStaffId?: string | null
  /** 編集のときだけ。種類は変えられない（006 と同じ） */
  initial?: RestrictionFormValues & { restrictionId: string; kind: RestrictionKind; hard: boolean }
}

/** 画面の値を、種別ごとに使う項目だけに絞って Action へ渡す形にする（未入力はそのまま送って Zod に弾かせる） */
function toInput(kind: RestrictionKind, values: RestrictionFormValues): RawRestrictionInput {
  switch (kind) {
    case 'deny_pattern_pair':
      return { kind, pattern1Id: values.pattern1Id, pattern2Id: values.pattern2Id }
    case 'max_work_week':
    case 'max_work_consecutive':
      return { kind, pattern1Id: values.pattern1Id, days: values.days }
    case 'sat_or_sun_dayoff':
      return { kind }
    case 'min_work_week':
    case 'max_weekend_days':
      return { kind, days: values.days }
    case 'prefer_dayoff_wdays':
      return { kind, wdays: values.wdays }
  }
}

/**
 * 強さの説明。必須の意味は種類で違う（013 §3.5）: 解が無くなりうるのは下限（週の最低勤務日数）だけで、
 * 上限は必須のままでも作れる（守るために枠が空く）ので緩めない
 */
function strengthHelp(kind: RestrictionKind, hard: boolean): string {
  // 「守れなかった」の表示は結果画面プラン（013 §3.1）。それまでは画面に出るとは書かない
  if (!hard) return '守れないときは破ります。'
  if (kind === 'min_work_week')
    return '必ず守ります。守ると作れないときだけ「なるべく」として扱います。'
  return '必ず守ります。そのために埋まらない枠が出たときは、結果に理由を出します。'
}

/**
 * 制約の登録 / 編集（013 §4.2）。対象 → 種類 → 内容 → 強さを 1 画面で選ぶ。
 * 種類は `?kind=` を shallow で書き換える（Server の再描画は要らない。選択肢は最初に渡してある）。
 */
export function RestrictionForm({
  tenantId,
  cycle,
  staffs,
  pattern1Options,
  pattern2Options,
  initialStaffId = null,
  initial,
}: Props) {
  const router = useRouter()
  const isEdit = Boolean(initial)
  const [query, setQuery] = useQueryStates(restrictionFormParsers)
  const hasWorkdayPattern = pattern1Options.length > 0
  // `?kind=` を直接書けば disabled のカードも選べてしまうので、パターンが要る種類は出勤日のパターンが無ければ捨てる
  const kind =
    initial?.kind ??
    (query.kind && requiresWorkdayPattern(query.kind) && !hasWorkdayPattern ? null : query.kind)
  const [values, setValues] = useState<RestrictionFormValues>(
    initial ?? {
      staffId: initialStaffId,
      pattern1Id: null,
      pattern2Id: null,
      days: RESTRICTION_DAYS_DEFAULT,
      wdays: [],
    }
  )
  const [target, setTarget] = useState<'all' | 'staff'>(
    (initial ? initial.staffId : initialStaffId) ? 'staff' : 'all'
  )
  // null = この種類ではまだ触っていない（種類の既定を使う。013 §3.4）。種類を変えたら null に戻す:
  // 既定は種類で違う（なるべく休みの曜日は常になるべく）ので、前の種類で選んだ強さを持ち越さない
  const [hardChoice, setHardChoice] = useState<boolean | null>(initial?.hard ?? null)
  const [error, setError] = useState<string>()
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof RestrictionFormValues>(key: K, value: RestrictionFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const hard =
    kind === null ? true : hasStrengthChoice(kind) ? (hardChoice ?? defaultHard(kind)) : false
  const staffId = target === 'staff' ? values.staffId : null

  // 対象を「スタッフ」にしたまま未選択なら、Zod ではなくここで止める（null は店舗全体の意味なので）
  const staffMissing = target === 'staff' && values.staffId === null
  const warning =
    kind === 'min_work_week' && typeof values.days === 'number'
      ? lowerBoundWarning({ kind, days: values.days, staff_id: staffId }, staffs)
      : null

  const cancelHref = `/tenants/${tenantId}/settings/restrictions`

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (kind === null) {
      setError('種類を選択してください')
      return
    }
    if (staffMissing) {
      setError('スタッフを選択してください')
      return
    }
    startTransition(async () => {
      const args = { tenantId, staffId, hard, input: toInput(kind, values) }
      const result = initial
        ? await updateRestriction({ ...args, restrictionId: initial.restrictionId })
        : await createRestriction(args)
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
      max={kind ? restrictionDaysMax(kind) : undefined}
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
    <form onSubmit={submit}>
      <SettingsSection
        footer={
          <>
            <LinkButton
              href={cancelHref}
              variant="subtle"
              color="gray"
              // 送信中に押すと、書き込みは走ったまま遷移して通知とエラー表示を取りこぼす
              disabled={isPending}
            >
              キャンセル
            </LinkButton>
            <Button type="submit" loading={isPending} disabled={kind === null}>
              {isEdit ? '保存' : '登録'}
            </Button>
          </>
        }
      >
        <Stack gap="lg">
          <FormErrorAlert message={error} />

          <RadioGroup
            label="対象"
            value={target}
            onChange={(value) => setTarget(value === 'staff' ? 'staff' : 'all')}
          >
            <Stack gap="xs" mt={4}>
              <Radio value="all" label="店舗全体（全員）" />
              <Group gap="sm" wrap="wrap">
                <Radio value="staff" label="スタッフを選ぶ" />
                <Select
                  aria-label="対象のスタッフ"
                  data={staffs.map((staff) => ({ value: staff.id, label: staff.name }))}
                  value={values.staffId}
                  onChange={(value) => {
                    set('staffId', value)
                    if (value) setTarget('staff')
                  }}
                  placeholder="選択してください"
                  disabled={target !== 'staff'}
                  searchable
                  w={200}
                />
              </Group>
            </Stack>
          </RadioGroup>

          {isEdit ? (
            <Input.Wrapper label="種類">
              <Text size="sm" mt={4}>
                {kind && RESTRICTION_KIND_LABELS[kind]}
              </Text>
            </Input.Wrapper>
          ) : (
            <Input.Wrapper label="種類">
              {!hasWorkdayPattern && (
                <Alert color="yellow" variant="light" mt={4} mb="xs">
                  勤務日のパターンを先に登録すると、パターンを使う種類も選べます。
                </Alert>
              )}
              <RadioGroup
                value={kind}
                onChange={(value) => {
                  const next = value as RestrictionKind
                  setError(undefined)
                  setHardChoice(null)
                  // 日数の上限は種類で違う（土日祝だけ 15）。strict の NumberInput は範囲外を直さないので、ここで収める
                  setValues((prev) =>
                    typeof prev.days === 'number' && prev.days > restrictionDaysMax(next)
                      ? { ...prev, days: restrictionDaysMax(next) }
                      : prev
                  )
                  void setQuery({ kind: next })
                }}
              >
                <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="xs" mt={4}>
                  {RESTRICTION_KINDS.map((option) => (
                    <Radio.Card
                      key={option}
                      value={option}
                      disabled={requiresWorkdayPattern(option) && !hasWorkdayPattern}
                      p="sm"
                      radius="sm"
                      style={
                        requiresWorkdayPattern(option) && !hasWorkdayPattern
                          ? { opacity: 0.5, cursor: 'not-allowed' }
                          : undefined
                      }
                    >
                      <Stack gap={2}>
                        <Text size="sm" fw={700}>
                          {RESTRICTION_KIND_LABELS[option]}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {RESTRICTION_KIND_EXAMPLES[option]}
                        </Text>
                      </Stack>
                    </Radio.Card>
                  ))}
                </SimpleGrid>
              </RadioGroup>
            </Input.Wrapper>
          )}

          {kind && (
            <Input.Wrapper label="内容">
              <Stack gap="xs" mt={4}>
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

                {kind === 'min_work_week' && (
                  <>
                    <Group gap="xs" align="center" wrap="wrap">
                      <Text size="sm">週に</Text>
                      {daysInput}
                      <Text size="sm">以上は入れる</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      シフト表の期間に丸ごと入る週で数えます（期間の端の週には掛かりません）。
                    </Text>
                    {warning && (
                      <Alert color="yellow" variant="light">
                        {warning}
                      </Alert>
                    )}
                  </>
                )}

                {kind === 'max_weekend_days' && (
                  <>
                    <Group gap="xs" align="center" wrap="wrap">
                      <Text size="sm">土日祝の勤務は{SHIFT_CYCLE_UNITS[cycle]}に</Text>
                      {daysInput}
                      <Text size="sm">まで</Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      シフト表の表示期間 1
                      回ぶんで数えます。表示期間を変えると、この上限の期間も変わります。
                    </Text>
                  </>
                )}

                {kind === 'prefer_dayoff_wdays' && (
                  <>
                    <CheckboxGroup
                      aria-label="なるべく休みの曜日"
                      value={values.wdays.map(String)}
                      onChange={(next) => set('wdays', next.map(Number))}
                    >
                      <Group gap="md">
                        {WEEKDAY_VALUES.map((wday) => (
                          <Checkbox
                            key={wday}
                            value={String(wday)}
                            label={WEEKDAY_LABELS[wday]}
                            disabled={
                              !values.wdays.includes(wday) &&
                              values.wdays.length >= PREFER_DAYOFF_WDAYS_MAX
                            }
                          />
                        ))}
                      </Group>
                    </CheckboxGroup>
                    <Text size="sm">はなるべく休み</Text>
                  </>
                )}
              </Stack>
            </Input.Wrapper>
          )}

          {kind && (
            <Input.Wrapper label="強さ">
              <Stack gap={6} mt={4}>
                {hasStrengthChoice(kind) ? (
                  <>
                    <SegmentedControl
                      value={hard ? 'hard' : 'soft'}
                      onChange={(value) => setHardChoice(value === 'hard')}
                      data={[
                        { value: 'hard', label: '必須' },
                        { value: 'soft', label: 'なるべく' },
                      ]}
                      w="fit-content"
                    />
                    <Text size="xs" c="dimmed">
                      {strengthHelp(kind, hard)}
                    </Text>
                  </>
                ) : (
                  <Text size="sm" c="dimmed">
                    なるべく（{strengthHelp(kind, false)}
                    必ず休みにするなら、スタッフの「勤務できる曜日」を外します）
                  </Text>
                )}
              </Stack>
            </Input.Wrapper>
          )}
        </Stack>
      </SettingsSection>
    </form>
  )
}
