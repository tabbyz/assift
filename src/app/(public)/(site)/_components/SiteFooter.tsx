import { Container } from '@mantine/core'
import { FooterLinks } from '@/components/FooterLinks'

/**
 * LP のフッター。リンクは利用規約・プライバシーポリシーと共通（`FooterLinks`）。ロゴはヘッダーにあるので置かない
 */
export function SiteFooter() {
  return (
    <footer>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }} pb={40}>
        <FooterLinks />
      </Container>
    </footer>
  )
}
