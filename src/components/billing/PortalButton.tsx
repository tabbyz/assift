'use client'

import { useTransition } from 'react'
import { Button, type ButtonProps } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { openPortal } from '@/app/(protected)/actions'

type Props = ButtonProps & { label: string }

/** Stripe のカスタマーポータル（お支払い方法・請求書・解約）を開く。外部 URL なので全体の読み込みで移る */
export function PortalButton({ label, ...props }: Props) {
  const [isPending, startTransition] = useTransition()
  const open = () =>
    startTransition(async () => {
      const r = await openPortal()
      if (!r.ok) {
        notifications.show({ message: r.error, color: 'red' })
        return
      }
      window.location.assign(r.data.redirectTo)
    })
  return (
    <Button onClick={open} loading={isPending} {...props}>
      {label}
    </Button>
  )
}
