'use client'

import type { ComponentProps, MouseEvent } from 'react'
import Link from 'next/link'
import { Button, type ButtonProps } from '@mantine/core'

type LinkProps = ComponentProps<typeof Link>

type Props = ButtonProps & {
  href: LinkProps['href']
  onClick?: LinkProps['onClick']
  /**
   * 無効化する。`<a>` は `disabled` 属性を解釈しないので、Mantine に渡すだけでは
   * 見た目が薄くなるだけでリンクは踏めてしまう（Button.css は `cursor: not-allowed` しか当てない）。
   * クリックとキーボードを実際に止め、タブ順からも外す。
   */
  disabled?: boolean
}

/**
 * next/link で遷移する Mantine Button。
 * `component={Link}` は関数なので、渡す側のファイルは 'use client' である必要がある（Mantine Help Center の指針）。
 * Server の page から使うために、その部分だけを Client コンポーネントとして切り出したもの。
 */
export function LinkButton({ href, disabled, onClick, ...props }: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (disabled) {
      // Enter キーでの発火もここを通る（フォーカス中のアンカーは click として届く）
      event.preventDefault()
      return
    }
    onClick?.(event)
  }

  return (
    <Button
      component={Link}
      href={href}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={handleClick}
      {...props}
    />
  )
}
