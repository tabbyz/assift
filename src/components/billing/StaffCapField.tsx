'use client'

import { NumberInput, Stack, Text } from '@mantine/core'
import { monthlyPriceYen } from '@/lib/billing/pricing'
import { STAFF_CAP_MAX } from '@/lib/validation/billing'

type Props = {
  value: number | ''
  onChange: (value: number | '') => void
  /** 選べる下限（`minStaffCap()`。在籍数より下にはできない） */
  min: number
  /** 旧料金のクーポン（「最大 ◯円」に効かせる） */
  discountPercent?: number
  label?: string
  error?: string | null
  /** 「最大 ◯円 / 月」を出すか。申し込みの確認画面は表（特商法の最終確認）に出すので出さない */
  showMaxPrice?: boolean
  /** 請求の一言に続けて同じ段落に書く補足（上限を変えるモーダルの「在籍 N 人より少なくはできません。…」） */
  note?: string
}

/**
 * 有料プランの在籍スタッフの上限の入力と「最大 ◯円 / 月」（019 §13.4）。申し込みの確認画面・上限の変更・上限で止まったときのモーダルで共有する。
 * 請求は上限ではなく実際の人数なので、その一言を添える
 */
export function StaffCapField({
  value,
  onChange,
  min,
  discountPercent = 0,
  label = '在籍スタッフの上限',
  error,
  showMaxPrice = true,
  note,
}: Props) {
  const valid = typeof value === 'number' && value >= min && value <= STAFF_CAP_MAX
  return (
    <Stack gap={6}>
      <NumberInput
        label={label}
        value={value}
        onChange={(next) => onChange(typeof next === 'number' ? next : '')}
        min={min}
        max={STAFF_CAP_MAX}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="none"
        suffix=" 人"
        error={error}
        w={160}
      />
      {showMaxPrice && valid && (
        <Text size="sm">
          最大 {monthlyPriceYen(value, discountPercent).toLocaleString()} 円 / 月（税込）
        </Text>
      )}
      {/* 補足が 1 文なら句点を付けない（ほかの画面の補足と同じ）。2 文以上になるときだけ付けて 1 段落にする */}
      <Text size="xs" c="dimmed">
        {note
          ? `請求は上限ではなく、その月の在籍スタッフの最大人数で決まります。${note}`
          : '請求は上限ではなく、その月の在籍スタッフの最大人数で決まります'}
      </Text>
    </Stack>
  )
}

/** 入力が下限〜上限に入っているか。外れていればその理由（ボタンを押せなくし、入力の下に出す） */
export function staffCapError(value: number | '', min: number): string | null {
  if (value === '') return '上限の人数を入力してください'
  if (value < min) return `上限は ${min} 人以上にしてください`
  if (value > STAFF_CAP_MAX) return `上限は ${STAFF_CAP_MAX} 人までです`
  return null
}
