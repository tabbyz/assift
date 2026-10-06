'use client'

import { useState, type RefObject } from 'react'
import {
  Button,
  Group,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { IconCheck, IconPencil, IconPlus } from '@tabler/icons-react'
import { cellStyle } from '@/components/shiftTable/cellStyle'
import type { PatternKind } from '@/lib/patterns/kinds'
import { isPairAvailable } from '@/lib/setup/patternsState'
import {
  INDUSTRIES,
  INDUSTRY_LABELS,
  type Industry,
  industryExample,
  nextUnusedColor,
  type SetupPatternRow,
  type SetupPatternsState,
  templateState,
} from '@/lib/setup/templates'
import { PATTERN_DESCRIPTION_MAX_LENGTH, PATTERN_NAME_MAX_LENGTH } from '@/lib/validation/patterns'
import { FieldError } from './FieldError'
import classes from './Setup.module.css'

type Props = {
  /** null = まだ業種を選んでいない */
  state: SetupPatternsState | null
  onChange: (state: SetupPatternsState | null) => void
  /** 業種名（テンプレートから選んだとき）。保存済みから戻したときは null */
  industry: Industry | null
  onIndustryChange: (industry: Industry | null) => void
  /** 保存済みの勤務を表示中か（選びなおすと置き換えるので確かめる） */
  fromSaved: boolean
  /** 「次へ」を押したあとに出す足りないもの（業種が未選択 / 働く日が 0 件） */
  error: string | null
  headingRef: RefObject<HTMLHeadingElement | null>
}

let newKeySeq = 0

/** 初期設定のステップ 2: 勤務の種類（014 §4.2） */
export function PatternsStep({
  state,
  onChange,
  industry,
  onIndustryChange,
  fromSaved,
  error,
  headingRef,
}: Props) {
  const [editingKey, setEditingKey] = useState<string | null>(null)

  const pick = (next: Industry) => {
    onIndustryChange(next)
    onChange(templateState(next))
    setEditingKey(null)
  }

  const chooseAgain = () => {
    const reset = () => {
      onIndustryChange(null)
      onChange(null)
      setEditingKey(null)
    }
    if (!fromSaved) return reset()
    modals.openConfirmModal({
      title: '業種を選びなおす',
      children: (
        <Text size="sm">
          いまの勤務の一覧は、選んだ業種でよく使う勤務に置き換わります（「次へ」を押すまでは保存されません）。
        </Text>
      ),
      labels: { confirm: '選びなおす', cancel: 'やめる' },
      onConfirm: reset,
    })
  }

  if (!state) {
    return (
      <Stack gap="xl">
        <Stack gap={6}>
          <Title order={2} fz={22} ref={headingRef} tabIndex={-1} className={classes.heading}>
            お店の業種を選んでください
          </Title>
          <Text c="dimmed">近いものを選ぶと、よく使う勤務を用意します。</Text>
        </Stack>
        <Stack gap={8}>
          <SimpleGrid id="setup-field-industry" cols={{ base: 1, xs: 2 }} spacing="sm">
            {INDUSTRIES.map((value) => (
              <UnstyledButton key={value} className={classes.industry} onClick={() => pick(value)}>
                <Text component="span" display="block" fw={700}>
                  {INDUSTRY_LABELS[value]}
                </Text>
                <Text component="span" display="block" size="sm" c="dimmed">
                  {industryExample(value)}
                </Text>
              </UnstyledButton>
            ))}
          </SimpleGrid>
          {/* 大きなボタンの並びの下なので、詰めすぎず 8px 空ける */}
          <FieldError message={error} mt={0} />
        </Stack>
      </Stack>
    )
  }

  const update = (key: string, patch: Partial<SetupPatternRow>) =>
    onChange({
      ...state,
      rows: state.rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    })

  const remove = (key: string) => {
    const pair =
      state.pair && (state.pair.fromKey === key || state.pair.toKey === key) ? null : state.pair
    onChange({
      ...state,
      rows: state.rows.filter((row) => row.key !== key),
      pair,
      pairEnabled: pair ? state.pairEnabled : false,
    })
    setEditingKey(null)
  }

  const add = () => {
    const key = `new-${++newKeySeq}`
    const colorHex = nextUnusedColor(
      state.rows.map((row) => row.colorHex),
      'workday'
    )
    onChange({
      ...state,
      rows: [
        ...state.rows,
        { key, name: '', description: '', colorHex, kind: 'workday', on: true },
      ],
    })
    setEditingKey(key)
  }

  const groups: { kind: PatternKind; title: string }[] = [
    { kind: 'workday', title: '働く日の勤務' },
    { kind: 'dayoff', title: 'お休み（勤務日数に数えません）' },
  ]

  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Title order={2} fz={22} ref={headingRef} tabIndex={-1} className={classes.heading}>
          お店で使う勤務にチェックを残してください
        </Title>
        <Text c="dimmed">名前や時間は鉛筆のボタンで直せます。</Text>
      </Stack>

      {/* 業種を選び間違えたときの戻り道。文中のリンクだと気付かれないので、ボタンにして目に入る場所に置く */}
      <Group className={classes.industryBar} justify="space-between" wrap="nowrap" gap="sm">
        <Text size="sm">
          {industry ? (
            <>
              業種：<b>{INDUSTRY_LABELS[industry]}</b>
            </>
          ) : (
            '保存してある勤務'
          )}
        </Text>
        <Button variant="default" size="compact-sm" onClick={chooseAgain}>
          業種を選びなおす
        </Button>
      </Group>

      {groups.map((group) => {
        const rows = state.rows.filter((row) => row.kind === group.kind)
        if (rows.length === 0) return null
        return (
          <Stack
            key={group.kind}
            id={group.kind === 'workday' ? 'setup-field-workday' : undefined}
            gap={8}
          >
            <Text fw={700}>{group.title}</Text>
            {rows.map((row) =>
              editingKey === row.key ? (
                <PatternEditor
                  key={row.key}
                  row={row}
                  onChange={(patch) => update(row.key, patch)}
                  onDone={() => setEditingKey(null)}
                  onRemove={() => remove(row.key)}
                />
              ) : (
                <PatternRow
                  key={row.key}
                  row={row}
                  onToggle={() => update(row.key, { on: !row.on })}
                  onEdit={() => setEditingKey(row.key)}
                />
              )
            )}
            {group.kind === 'workday' && <FieldError message={error} />}
          </Stack>
        )
      })}

      {isPairAvailable(state) && (
        <Switch
          label="夜勤の次の日に「明け」を自動で入れる"
          checked={state.pairEnabled}
          onChange={(event) => onChange({ ...state, pairEnabled: event.currentTarget.checked })}
          size="md"
        />
      )}

      <Button
        variant="default"
        leftSection={<IconPlus size={18} />}
        onClick={add}
        size="md"
        styles={{ root: { borderStyle: 'dashed' } }}
      >
        ほかの勤務を追加する
      </Button>
    </Stack>
  )
}

/** シフト表のマスと同じ見た目（名前を全部出す）。表でどう見えるかを、その場で確かめられるようにする */
function Swatch({ row }: { row: SetupPatternRow }) {
  return (
    <span className={classes.swatch} style={cellStyle(row, true)} aria-hidden>
      {row.name || '？'}
    </span>
  )
}

/** 行全体がチェックのボタン。チェックの状態は色だけでなく、チェック印と取り消し線で示す（014 §4.9） */
function PatternRow({
  row,
  onToggle,
  onEdit,
}: {
  row: SetupPatternRow
  onToggle: () => void
  onEdit: () => void
}) {
  const sub = row.description || (row.kind === 'dayoff' ? 'お休み' : '時間は未設定（なくてもOK）')
  return (
    <div className={classes.patternRow} data-off={!row.on || undefined}>
      <UnstyledButton className={classes.patternToggle} aria-pressed={row.on} onClick={onToggle}>
        <Swatch row={row} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <Text component="span" display="block" fw={700} className={classes.patternName}>
            {row.name || '（名前なし）'}
          </Text>
          <Text component="span" display="block" size="sm" c="dimmed">
            {sub}
          </Text>
        </span>
        <span className={classes.check} data-on={row.on || undefined} aria-hidden>
          {row.on && <IconCheck size={16} stroke={3} />}
        </span>
      </UnstyledButton>
      <UnstyledButton
        className={classes.patternEdit}
        onClick={onEdit}
        aria-label={`${row.name || '勤務'}を直す`}
      >
        <IconPencil size={18} />
      </UnstyledButton>
    </div>
  )
}

type EditorProps = {
  row: SetupPatternRow
  onChange: (patch: Partial<SetupPatternRow>) => void
  onDone: () => void
  onRemove: () => void
}

function PatternEditor({ row, onChange, onDone, onRemove }: EditorProps) {
  return (
    <Stack
      gap="sm"
      p="md"
      style={{
        border: '2px solid var(--mantine-color-dark-4)',
        borderRadius: 'var(--mantine-radius-md)',
      }}
    >
      <Group gap="sm" align="flex-start" wrap="nowrap">
        <Swatch row={row} />
        <TextInput
          label="名前"
          description={`${PATTERN_NAME_MAX_LENGTH}文字まで`}
          maxLength={PATTERN_NAME_MAX_LENGTH}
          value={row.name}
          onChange={(event) => onChange({ name: event.currentTarget.value })}
          autoFocus
          flex={1}
        />
      </Group>
      <TextInput
        label="時間（なくてもOK）"
        placeholder="例）9-17時"
        description={`シフト表の下に出ます（${PATTERN_DESCRIPTION_MAX_LENGTH}文字まで）`}
        maxLength={PATTERN_DESCRIPTION_MAX_LENGTH}
        value={row.description}
        onChange={(event) => onChange({ description: event.currentTarget.value })}
      />
      <SegmentedControl
        data={[
          { value: 'workday', label: '働く日' },
          { value: 'dayoff', label: 'お休み' },
        ]}
        value={row.kind}
        onChange={(value) => onChange({ kind: value as PatternKind })}
        aria-label="勤務の区分"
      />
      <Group justify="space-between">
        <Button variant="subtle" color="red" onClick={onRemove}>
          削除する
        </Button>
        <Button onClick={onDone} disabled={row.name.trim() === ''}>
          OK
        </Button>
      </Group>
    </Stack>
  )
}
