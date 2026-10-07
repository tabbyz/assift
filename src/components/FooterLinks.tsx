import Link from 'next/link'
import { Group, Stack } from '@mantine/core'
import classes from './FooterLinks.module.css'

/**
 * フッターのリンク（利用規約・プライバシーポリシー・特商法表記）と著作権表示。LP と各規約ページで共有する（017 / 018）。
 * ロゴは各ページのヘッダーにあるので持たない。
 *
 * スマホ幅ではリンクが 2 行に折り返す。© をリンクと同じ行に混ぜると、フォント（LP は Zen Kaku Gothic New、
 * ほかはシステムフォント）の幅次第で © だけが 1 行に残ったりするので、© は常にリンクの下の行に置く。
 * 折り返した行の間は列の間より詰める（同じ gap だと行間が空きすぎて別の段に見える）
 */
export function FooterLinks() {
  return (
    <Stack gap={10} align="center">
      <Group component="nav" aria-label="フッター" justify="center" gap="lg" style={{ rowGap: 6 }}>
        <Link href="/terms" className={classes.link}>
          利用規約
        </Link>
        <Link href="/privacy" className={classes.link}>
          プライバシーポリシー
        </Link>
        <Link href="/law" className={classes.link}>
          特定商取引法に基づく表記
        </Link>
      </Group>
      <small className={classes.copyright}>© assift</small>
    </Stack>
  )
}
