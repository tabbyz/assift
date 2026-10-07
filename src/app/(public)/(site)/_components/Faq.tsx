import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Container,
  Text,
} from '@mantine/core'
import { Phrases } from './Phrases'
import { SectionHeading } from './SectionHeading'
import classes from '../Site.module.css'

/** `question` は `Phrases` の書式（`|` で文節） */
const QUESTIONS = [
  {
    question: 'スタッフも|アカウントを|作る必要が|ありますか？',
    answer: 'いいえ。店長が発行した共有のURLを開くだけで見られます。',
  },
  {
    question: 'スマホだけで|作れますか？',
    answer: 'はい。表づくりからAIでの作成、共有まで、すべてスマホのブラウザでできます。',
  },
  {
    question: 'AIが勝手に|シフトを|確定して|しまいませんか？',
    answer:
      'AIが入れるのは下書きだけで、確定済みのシフトには触れません。「元に戻す」を押すと、その回にAIが入れた下書きだけが消えます。',
  },
  {
    question: '夜勤の次の日を|自動で「明け」に|できますか？',
    answer:
      '勤務パターンに「翌日に入れるパターン」を設定しておくと、夜勤を入れたときに翌日に明けが入ります。',
  },
  {
    question: '複数の店舗で|使えますか？',
    answer: '1つのアカウントで複数の店舗を作り、切り替えて使えます。',
  },
]

/** よくある質問 */
export function Faq() {
  return (
    <section id="faq" className={classes.section}>
      <Container size={1120} px={{ base: 'md', sm: 'lg' }}>
        <SectionHeading kicker="よくある質問" title="使う前に|気になること" />
        <Accordion
          variant="separated"
          chevronPosition="right"
          maw={860}
          classNames={{
            item: classes.faqItem,
            control: classes.faqControl,
            label: classes.faqLabel,
          }}
        >
          {QUESTIONS.map(({ question, answer }) => (
            <AccordionItem key={question} value={question}>
              <AccordionControl>
                <Phrases>{question}</Phrases>
              </AccordionControl>
              <AccordionPanel>
                <Text c="dimmed" fz={15}>
                  {answer}
                </Text>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </Container>
    </section>
  )
}
