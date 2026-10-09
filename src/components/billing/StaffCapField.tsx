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
}

/**
 * 有料プランの在籍スタッフの上限の入力と「最大 ◯円」（019 §13.4）。申し込みの確認画面・上限の変更・上限で止まったときのモーダルで共有する。
 * 請求は上限ではなく実際の人数なので、その一文を必ず添える
 */
export function StaffCapField({
  value,
  onChange,
  min,
  discountPercent = 0,
  label = '在籍スタッフの上限',
  error,
}: Props) {
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
      {typeof value === 'number' && value >= min && value <= STAFF_CAP_MAX && (
        <Text size="sm">
          上限 {value} 人の場合、毎月の料金は最大{' '}
          {monthlyPriceYen(value, discountPercent).toLocaleString()} 円（税込）です。
        </Text>
      )}
      <Text size="xs" c="dimmed">
        上限を超えてスタッフを登録することはできません。お支払いは上限の人数分ではなく、その月に在籍スタッフが最も多かったときの人数で決まります。
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
