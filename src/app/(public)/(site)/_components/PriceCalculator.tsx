'use client'

import { useState } from 'react'
import { Group, Slider, Stack, Text, Title } from '@mantine/core'
import { IconArrowRight } from '@tabler/icons-react'
import { LinkButton } from '@/components/LinkButton'
import {
  FREE_STAFF_LIMIT,
  PRICE_PER_STAFF_YEN,
  billableStaffCount,
  monthlyPriceYen,
} from '@/lib/billing/pricing'
import classes from '../Site.module.css'

const yen = new Intl.NumberFormat('ja-JP')

const MAX_STAFF = 50
const MARKS = [1, 10, 20, 30, 40, 50].map((value) => ({ value, label: String(value) }))

/** 料金の計算スライダー（016）。規則は `lib/billing/pricing` */
export function PriceCalculator() {
  const [staffCount, setStaffCount] = useState(15)
  const billable = billableStaffCount(staffCount)

  return (
    <Stack gap={22} className={`${classes.panel} ${classes.calc}`}>
      <Title order={3} fz={18} fw={900}>
        月額を計算する
      </Title>
      <div>
        <Group justify="space-between" align="baseline">
          <Text component="label" htmlFor="price-staff-count" fw={700}>
            在籍スタッフ
          </Text>
          <Text component="output" htmlFor="price-staff-count" className={classes.calcValue}>
            {staffCount}人
          </Text>
        </Group>
        <Slider
          id="price-staff-count"
          value={staffCount}
          onChange={setStaffCount}
          min={1}
          max={MAX_STAFF}
          step={1}
          marks={MARKS}
          color="dark"
          size="md"
          label={null}
          mt="xs"
          mb="xl"
          thumbLabel="在籍スタッフの人数"
        />
      </div>
      <Group justify="space-between" align="baseline" className={classes.total} role="status">
        <Text c="dimmed" fz={14}>
          月額
        </Text>
        <Text className={classes.totalValue}>
          {yen.format(monthlyPriceYen(staffCount))}
          <small>円</small>
        </Text>
      </Group>
      <Text c="dimmed" fz={13} mt={-10}>
        {billable > 0
          ? `${FREE_STAFF_LIMIT}人までは0円。${FREE_STAFF_LIMIT}人を超えた${billable}人 × ${PRICE_PER_STAFF_YEN}円`
          : `${FREE_STAFF_LIMIT}人までは0円です`}
      </Text>
      <LinkButton
        href="/signup"
        size="lg"
        radius="xl"
        fullWidth
        rightSection={<IconArrowRight size={18} stroke={2.4} />}
      >
        無料ではじめる
      </LinkButton>
    </Stack>
  )
}
