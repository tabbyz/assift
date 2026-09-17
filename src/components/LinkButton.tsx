'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Button, type ButtonProps } from '@mantine/core'

type Props = ButtonProps & { href: ComponentProps<typeof Link>['href'] }

/**
 * next/link で遷移する Mantine Button。
 * `component={Link}` は関数なので、渡す側のファイルは 'use client' である必要がある（Mantine Help Center の指針）。
 * Server の page から使うために、その部分だけを Client コンポーネントとして切り出したもの。
 */
export function LinkButton({ href, ...props }: Props) {
  return <Button component={Link} href={href} {...props} />
}
