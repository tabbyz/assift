'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MenuItem, NavLink } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconLogout } from '@tabler/icons-react'
import { logout } from '@/app/(protected)/actions'

/** ログアウト処理。メニュー項目とナビ項目で見た目だけ変えて使い回す */
function useLogout() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const run = () =>
    startTransition(async () => {
      const result = await logout()
      if (!result.ok) {
        notifications.show({ message: result.error, color: 'red' })
        return
      }
      router.push(result.data.redirectTo)
    })

  return { run, isPending }
}

/** Menu.Dropdown の中で使うログアウト */
export function LogoutMenuItem() {
  const { run, isPending } = useLogout()
  return (
    <MenuItem leftSection={<IconLogout size={16} />} onClick={run} disabled={isPending}>
      ログアウト
    </MenuItem>
  )
}

/** モバイルの Navbar で使うログアウト */
export function LogoutNavLink() {
  const { run, isPending } = useLogout()
  return (
    <NavLink
      component="button"
      type="button"
      label="ログアウト"
      leftSection={<IconLogout size={18} />}
      onClick={run}
      disabled={isPending}
    />
  )
}
