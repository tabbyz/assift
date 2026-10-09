'use client'

import { useState, useTransition } from 'react'
import { Button, Group, NumberInput, Stack, Text } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import type { ActionResult } from '@/lib/actions/result'
import { FREE_STAFF_LIMIT } from '@/lib/billing/pricing'
import { formatYearMonthDay } from '@/lib/calendar/dateString'
import { TRIAL_LAST_DAY_MAX } from '@/lib/validation/admin'
import { STAFF_CAP_MAX, STAFF_CAP_MIN } from '@/lib/validation/billing'
import { endTrialNow, resetTrial, setManualLimit, setTrialLastDay } from '../actions'

type Props = {
  userId: string
  /** トライアルの最終日（YYYY-MM-DD）。null = 一度も使っていない */
  trialLastDay: string | null
  canEditTrial: boolean
  canEndTrialNow: boolean
  manualLimit: number | null
}

/**
 * トライアルと個別契約の上限の操作（020 §7）。どれも確認のモーダルを挟む。
 * 入力の初期値は props から取るので、呼び出し側が値の変化で key を変えて作り直す
 */
export function PlanControls({
  userId,
  trialLastDay,
  canEditTrial,
  canEndTrialNow,
  manualLimit,
}: Props) {
  const [isPending, startTransition] = useTransition()
  const [lastDay, setLastDay] = useState<string | null>(trialLastDay)
  const [limit, setLimit] = useState<number | string>(manualLimit ?? '')

  const run = (title: string, body: string, action: () => Promise<ActionResult>, done: string) =>
    modals.openConfirmModal({
      title,
      children: <Text size="sm">{body}</Text>,
      labels: { confirm: '実行する', cancel: 'キャンセル' },
      onConfirm: () =>
        startTransition(async () => {
          const r = await action()
          notifications.show({ message: r.ok ? done : r.error, color: r.ok ? 'green' : 'red' })
        }),
    })

  const limitValue = typeof limit === 'number' ? limit : null

  return (
    <Stack gap="lg">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          トライアル（{trialLastDay ? `最終日 ${formatYearMonthDay(trialLastDay)}` : '未使用'}）
        </Text>
        {canEditTrial ? (
          <Group align="flex-end" gap="xs">
            <DatePickerInput
              label="最終日"
              value={lastDay}
              onChange={setLastDay}
              clearable={false}
              maxDate={TRIAL_LAST_DAY_MAX}
              w={180}
            />
            <Button
              variant="default"
              disabled={!lastDay || lastDay === trialLastDay}
              loading={isPending}
              onClick={() =>
                lastDay &&
                run(
                  'トライアルの最終日を変える',
                  `最終日を ${formatYearMonthDay(lastDay)} にします。過去の日にするとその時点で終わります。`,
                  () => setTrialLastDay({ userId, lastDay }),
                  'トライアルの最終日を変えました'
                )
              }
            >
              最終日を保存
            </Button>
            {canEndTrialNow && (
              <Button
                variant="default"
                loading={isPending}
                onClick={() =>
                  run(
                    'トライアルを今すぐ終える',
                    'トライアルを終えます（使ったものとして扱います）。在籍スタッフが上限を超えていれば、店舗はロックされます。',
                    () => endTrialNow({ userId }),
                    'トライアルを終えました'
                  )
                }
              >
                今すぐ終える
              </Button>
            )}
            {trialLastDay !== null && (
              <Button
                variant="default"
                loading={isPending}
                onClick={() =>
                  run(
                    'トライアルを未使用に戻す',
                    'トライアルを使っていない状態に戻します。利用者はもう一度トライアルを始められます。',
                    () => resetTrial({ userId }),
                    'トライアルを未使用に戻しました'
                  )
                }
              >
                未使用に戻す
              </Button>
            )}
          </Group>
        ) : (
          <Text size="sm" c="dimmed">
            有料プランの契約が残っているため変更できません（トライアルの終わりは請求の区間に使われます）
          </Text>
        )}
      </Stack>

      <Stack gap="xs">
        <Text size="sm" fw={600}>
          個別契約の上限（{manualLimit === null ? '通常' : `${manualLimit}人`}）
        </Text>
        <Group align="flex-end" gap="xs">
          <NumberInput
            label="上限の人数"
            value={limit}
            onChange={setLimit}
            min={STAFF_CAP_MIN}
            max={STAFF_CAP_MAX}
            allowDecimal={false}
            allowNegative={false}
            suffix="人"
            w={180}
          />
          <Button
            variant="default"
            disabled={limitValue === null || limitValue === manualLimit}
            loading={isPending}
            onClick={() =>
              limitValue !== null &&
              run(
                '個別契約の上限を設定する',
                `在籍スタッフの上限を ${limitValue}人にします。有料プラン・トライアル中は効きません。`,
                () => setManualLimit({ userId, limit: limitValue }),
                '個別契約の上限を設定しました'
              )
            }
          >
            上限を保存
          </Button>
          {manualLimit !== null && (
            <Button
              variant="default"
              loading={isPending}
              onClick={() =>
                run(
                  '個別契約の上限を通常に戻す',
                  `個別契約をやめ、通常の上限（無料は ${FREE_STAFF_LIMIT}人まで）に戻します。`,
                  () => setManualLimit({ userId, limit: null }),
                  '個別契約の上限を通常に戻しました'
                )
              }
            >
              通常に戻す
            </Button>
          )}
        </Group>
      </Stack>
    </Stack>
  )
}
