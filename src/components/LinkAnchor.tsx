'use client'

import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Anchor, type AnchorProps } from '@mantine/core'

type Props = AnchorProps & { href: ComponentProps<typeof Link>['href']; children: React.ReactNode }

/** next/link で遷移する Mantine Anchor。LinkButton と同じ理由で Client に切り出している */
export function LinkAnchor({ href, ...props }: Props) {
  return <Anchor component={Link} href={href} {...props} />
}
