import { Container, Group, SimpleGrid, Stack, Text } from '@mantine/core'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN } from '@/lib/billing/pricing'
import { PriceCalculator } from './PriceCalculator'
import { SectionHeading } from './SectionHeading'
import classes from '../Site.module.css'

/** 料金。数字は `lib/billing/pricing` から引く */
export function Pricing() {
  return (
    <section id="price" className={classes.section}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing={20}>
          <Stack gap={20} pr={{ md: 24 }}>
            <SectionHeading
              kicker="料金"
              title={`${FREE_STAFF_LIMIT}人までは、|無料で使えます`}
              mb={0}
            />
            <Group gap="6px 14px" align="baseline">
              <Text component="span" className={classes.priceBig}>
                0<small>円</small>
              </Text>
              <Text component="span" fw={700}>
                スタッフ{FREE_STAFF_LIMIT}人まで
              </Text>
            </Group>
            <Text fz={16}>
              {FREE_STAFF_LIMIT + 1}人目からは
              <span className={classes.priceRuleStrong}>1人{PRICE_PER_STAFF_YEN}円</span>／月
            </Text>
            <Text className={classes.micro}>
              機能はどの人数でも同じです。数えるのは在籍しているスタッフです。
            </Text>
          </Stack>
          <PriceCalculator />
        </SimpleGrid>
      </Container>
    </section>
  )
}
