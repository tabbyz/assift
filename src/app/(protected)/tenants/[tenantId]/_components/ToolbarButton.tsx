'use client'

import type { ComponentPropsWithRef } from 'react'
import { Button, type ButtonProps } from '@mantine/core'
import classes from './ToolbarButton.module.css'

/**
 * ツールバーの動詞ボタン（AI で作成・共有・操作）。見た目をこの 1 か所に集める。
 *
 * 高さは前後の期間を送る `ActionIcon`（28px）に合わせる。`compact-sm` の既定は 26px で、
 * 並べると送りのボタンだけ 2px 高くなる。
 * 狭い画面でアイコンを隠す規則は `ToolbarButton.module.css`。
 *
 * `Menu` の target になるので ref を素通しする（React 19 では ref も props の 1 つ）。
 */
export function ToolbarButton(props: ButtonProps & ComponentPropsWithRef<'button'>) {
  return (
    <Button
      variant="default"
      size="compact-sm"
      h={28}
      classNames={{ root: classes.root, section: classes.icon }}
      {...props}
    />
  )
}
