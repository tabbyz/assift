import Link from 'next/link'
import { Container, Group, Text } from '@mantine/core'
import { Logo } from './Logo'
import classes from '../Site.module.css'

/**
 * LP のフッター。規約・プライバシーはサインアップ画面と同じリンク先（ページ自体は静的ページのマイルストーンで足す。016 §5）
 */
export function SiteFooter() {
  return (
    <footer>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }} pb={40}>
        <Group gap="md" justify="space-between">
          <Logo />
          <Group component="nav" aria-label="フッター" gap="lg">
            <Link href="/terms" className={classes.footerLink}>
              利用規約
            </Link>
            <Link href="/privacy" className={classes.footerLink}>
              プライバシーポリシー
            </Link>
            <Text component="span" fz={13} c="dimmed">
              © assift
            </Text>
          </Group>
        </Group>
      </Container>
    </footer>
  )
}
