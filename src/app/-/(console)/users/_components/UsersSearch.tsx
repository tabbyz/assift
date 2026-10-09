'use client'

import { TextInput } from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import { debounce, useQueryStates } from 'nuqs'
import { adminUsersParsers } from '../searchParams'

/** メールアドレスの部分一致。Server が読み直すので shallow: false。検索語が変わったら 1 ページ目に戻す */
export function UsersSearch() {
  const [{ q }, setParams] = useQueryStates(adminUsersParsers, { shallow: false })

  return (
    <TextInput
      placeholder="メールアドレスで検索"
      leftSection={<IconSearch size={16} />}
      value={q}
      onChange={(e) =>
        setParams(
          { q: e.currentTarget.value || null, page: null },
          { limitUrlUpdates: debounce(300) }
        )
      }
      maw={400}
    />
  )
}
