'use client'

import { ActionIcon, NumberInput, Switch, Text, Tooltip } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { DAY_KEYS, DAY_KEY_LABELS, dayKeyColor, type DayKey } from '@/lib/calendar/weekdays'
import { REQUIRED_NUM_MAX, REQUIRED_NUM_MIN } from '@/lib/patterns/requiredNums'
import {
  columnTotal,
  fillForward,
  setCell,
  setUniform,
  uniformValue,
  type RequiredNumsMatrix as Matrix,
} from '@/lib/patterns/requiredNumsMatrix'
import styles from './RequiredNumsMatrix.module.css'

export type RequiredNumsMatrixPattern = { id: string; name: string; colorHex: string }

type Props = {
  /** 出勤日の勤務だけ（休みは必要人数を持たない。006 §3.9） */
  patterns: RequiredNumsMatrixPattern[]
  value: Matrix
  onChange: (value: Matrix) => void
  /** 「どの曜日も同じ人数にする」（015 §3.5） */
  uniform: boolean
  /** 省略すると曜日ごとに戻せない（AI シフト作成の中で勤務ごとに 1 つだけ聞くとき） */
  onUniformChange?: (uniform: boolean) => void
  disabled?: boolean
}

/**
 * 勤務 × 曜日の必要人数（015 §3.4）。`設定 > 必要人数` と AI シフト作成のモーダルで共有する。
 *
 * **空欄は「まだ決めていない」**、`0` は「0 人」。スイッチが ON のあいだは列が 1 本になり、
 * 入れた数は全曜日 + 祝に入る。
 */
export function RequiredNumsMatrix({
  patterns,
  value,
  onChange,
  uniform,
  onUniformChange,
  disabled,
}: Props) {
  const columns: (DayKey | 'uniform')[] = uniform ? ['uniform'] : [...DAY_KEYS]

  const cellValue = (patternId: string, column: DayKey | 'uniform'): number | '' =>
    column === 'uniform' ? uniformValue(value, patternId) : (value[patternId]?.[column] ?? '')

  const change = (patternId: string, column: DayKey | 'uniform', raw: number | string) => {
    const next = raw === '' || raw === null ? '' : Number(raw)
    onChange(
      column === 'uniform'
        ? setUniform(value, patternId, next)
        : setCell(value, patternId, column, next)
    )
  }

  return (
    <div className={styles.root}>
      {onUniformChange && (
        <Switch
          label="どの曜日も同じ人数にする"
          checked={uniform}
          onChange={(event) => onUniformChange(event.currentTarget.checked)}
          disabled={disabled}
        />
      )}

      <div className={styles.scroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.nameHead} scope="col">
                勤務
              </th>
              {columns.map((column) => (
                <th key={column} className={styles.dayHead} scope="col">
                  {column === 'uniform' ? (
                    <Text size="sm" fw={700}>
                      人数
                    </Text>
                  ) : (
                    <span className={styles.dayHeadInner}>
                      <Text size="sm" fw={700} c={dayKeyColor(column)}>
                        {DAY_KEY_LABELS[column]}
                      </Text>
                      {column !== 'holiday' && (
                        <Tooltip label="以降の曜日にコピー" withArrow>
                          <ActionIcon
                            type="button"
                            className={styles.copy}
                            variant="subtle"
                            color="gray"
                            size="sm"
                            aria-label={`${DAY_KEY_LABELS[column]}の人数を右の曜日にコピー`}
                            onClick={() => onChange(fillForward(value, column))}
                            disabled={disabled}
                          >
                            <IconArrowRight size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {patterns.map((pattern) => (
              <tr key={pattern.id}>
                <th className={styles.name} scope="row">
                  <span className={styles.swatch} style={{ backgroundColor: pattern.colorHex }} />
                  <Text size="sm" truncate>
                    {pattern.name}
                  </Text>
                </th>
                {columns.map((column) => (
                  <td key={column} className={styles.cell}>
                    <NumberInput
                      className={styles.field}
                      aria-label={`${pattern.name}・${
                        column === 'uniform' ? 'どの曜日も同じ' : `${DAY_KEY_LABELS[column]}曜`
                      }の必要人数`}
                      value={cellValue(pattern.id, column)}
                      onChange={(raw) => change(pattern.id, column, raw)}
                      placeholder="—"
                      min={REQUIRED_NUM_MIN}
                      max={REQUIRED_NUM_MAX}
                      clampBehavior="strict"
                      allowDecimal={false}
                      allowNegative={false}
                      hideControls
                      disabled={disabled}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {patterns.length > 1 && (
            <tfoot>
              <tr>
                <th className={styles.name} scope="row">
                  <Text size="xs" c="dimmed">
                    1 日の合計
                  </Text>
                </th>
                {columns.map((column) => {
                  const total =
                    column === 'uniform' ? columnTotal(value, '1') : columnTotal(value, column)
                  return (
                    <td key={column} className={styles.total}>
                      <Text size="xs" c="dimmed">
                        {total === null ? '—' : total}
                      </Text>
                    </td>
                  )
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
