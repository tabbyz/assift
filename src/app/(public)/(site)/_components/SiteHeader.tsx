import Link from 'next/link'
import { Container, Group } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { Logo } from './Logo'
import classes from '../Site.module.css'

/**
 * LP と静的ページ（規約・ポリシー・特商法表記）のヘッダー。
 * LP の見出しへの行き先は `/#…`。LP の上ではその見出しへスクロールし、ほかのページからは LP へ移る
 * （`#price` だけにすると `/terms` の「料金」条へ飛んでしまう）。
 * ログイン中は LP のための項目（見出しへのリンク・「ログイン」「無料ではじめる」）を出さず、「アプリを開く」だけにする（`/tenants` が直近の店舗へ送る。031）
 */
export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className={classes.header}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <Group className={classes.headerInner} justify="space-between" wrap="nowrap">
          <Logo />
          {loggedIn ? (
            <LinkButton href="/tenants" radius="xl">
              アプリを開く
            </LinkButton>
          ) : (
            <Group gap={26} wrap="nowrap">
              <Group component="nav" aria-label="ページ内" gap={26} className={classes.nav}>
                <Link href="/#features" className={classes.navLink}>
                  できること
                </Link>
                <Link href="/#price" className={classes.navLink}>
                  料金
                </Link>
                <Link href="/#faq" className={classes.navLink}>
                  よくある質問
                </Link>
              </Group>
              <Link href="/login" className={classes.loginLink}>
                ログイン
              </Link>
              <LinkButton href="/signup" radius="xl" className={classes.headerCta}>
                無料ではじめる
              </LinkButton>
            </Group>
          )}
        </Group>
      </Container>
    </header>
  )
}
