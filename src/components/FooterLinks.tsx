import Link from 'next/link'
import { Group, Text } from '@mantine/core'
import classes from './FooterLinks.module.css'

/**
 * フッターのリンク（利用規約・プライバシーポリシー・特商法表記・著作権表示）。LP と各規約ページで共有する（017 / 018）。
 * ロゴは各ページのヘッダーにあるので持たない
 */
export function FooterLinks() {
  return (
    <Group component="nav" aria-label="フッター" gap="lg" justify="center">
      <Link href="/terms" className={classes.link}>
        利用規約
      </Link>
      <Link href="/privacy" className={classes.link}>
        プライバシーポリシー
      </Link>
      <Link href="/law" className={classes.link}>
        特定商取引法に基づく表記
      </Link>
      <Text component="span" fz={13} c="dimmed">
        © assift
      </Text>
    </Group>
  )
}
