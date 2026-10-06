import Link from 'next/link'
import { Container, Group } from '@mantine/core'
import { LinkButton } from '@/components/LinkButton'
import { Logo } from './Logo'
import classes from '../Site.module.css'

/** LP のヘッダー。ページ内の行き先は素の `<a>`（同じページの見出しへ飛ぶだけ） */
export function SiteHeader() {
  return (
    <header className={classes.header}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <Group className={classes.headerInner} justify="space-between" wrap="nowrap">
          <Logo />
          <Group gap={26} wrap="nowrap">
            <Group component="nav" aria-label="ページ内" gap={26} className={classes.nav}>
              <a href="#features" className={classes.navLink}>
                できること
              </a>
              <a href="#price" className={classes.navLink}>
                料金
              </a>
              <a href="#faq" className={classes.navLink}>
                よくある質問
              </a>
            </Group>
            <Link href="/login" className={classes.loginLink}>
              ログイン
            </Link>
            <LinkButton href="/signup" radius="xl">
              無料ではじめる
            </LinkButton>
          </Group>
        </Group>
      </Container>
    </header>
  )
}
