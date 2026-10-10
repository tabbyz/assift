'use client'

import { useState, useTransition } from 'react'
import { Button, Group, Stack } from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { setStaffCap } from '@/app/(protected)/actions'
import { minStaffCap } from '@/lib/billing/staffCap'
import { StaffCapField, staffCapError } from './StaffCapField'

const MODAL_ID = 'staff-cap'

type Options = {
  /** いまの上限（null = まだ決めていない） */
  current: number | null
  activeStaffCount: number
  discountPercent: number
}

/**
 * 有料プランの在籍スタッフの上限を変える（019 §13.4）。「プランとお支払い」とスタッフの設定から開く。
 * 在籍数より下にはできない（下げたいときは先にスタッフを退職にする）
 */
export function openStaffCapModal(options: Options) {
  modals.open({
    modalId: MODAL_ID,
    title: '在籍スタッフの上限を変える',
    children: <StaffCapForm {...options} />,
  })
}

function StaffCapForm({ current, activeStaffCount, discountPercent }: Options) {
  const min = minStaffCap(activeStaffCount)
  const [cap, setCap] = useState<number | ''>(() => Math.max(current ?? min, min))
  const [isPending, startTransition] = useTransition()
  const error = staffCapError(cap, min)

  const submit = () =>
    startTransition(async () => {
      const r = await setStaffCap({ staffCap: cap })
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      notifications.show({ message: `上限を ${r.data.staffCap} 人にしました`, color: 'green' })
      modals.close(MODAL_ID)
    })

  return (
    <Stack gap="md">
      <StaffCapField
        value={cap}
        onChange={setCap}
        min={min}
        discountPercent={discountPercent}
        label="新しい上限"
        error={cap === '' ? null : error}
        note={`在籍している ${activeStaffCount} 人より少なくはできません。減らすときは、先にスタッフを退職済みにしてください。`}
      />
      <Group justify="flex-end">
        <Button variant="default" onClick={() => modals.close(MODAL_ID)}>
          やめる
        </Button>
        <Button onClick={submit} loading={isPending} disabled={error !== null}>
          変更する
        </Button>
      </Group>
    </Stack>
  )
}
