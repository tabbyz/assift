import type { ReactNode } from 'react'
import { Anchor, Text } from '@mantine/core'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { TERMS } from '../../terms/_components/terms'
import { LAW } from './law'

/**
 * 特定商取引法に基づく表記の各項目（018 §3）。役務（サービス）の通信販売として、法 11 条と施行規則が求める事項を並べる。
 *
 * 料金・解約の中身は利用規約「料金」（016）と食い違わないように書き、数字は `lib/billing/pricing` から引く。
 * 住所・電話番号は「ご請求があれば遅滞なく開示」で省略する（法 11 条ただし書。価格を全部表示していることが前提）。
 */
export type LawItem = { label: string; body: ReactNode }

/** 料金の例に使う人数 */
const EXAMPLE_STAFF_COUNT = 15

/** 住所・電話番号（と、`sellerName` が null のときの氏名）を省略するときの表示 */
const DISCLOSE_ON_REQUEST = (
  <Text>
    ご請求があれば、遅滞なく電子メールでお知らせします。下記のメールアドレスまでご連絡ください。
  </Text>
)

function P({ children }: { children: ReactNode }) {
  return <Text>{children}</Text>
}

export const LAW_ITEMS: LawItem[] = [
  {
    label: '販売事業者',
    body: LAW.sellerName ? <P>{LAW.sellerName}</P> : DISCLOSE_ON_REQUEST,
  },
  { label: '所在地', body: DISCLOSE_ON_REQUEST },
  { label: '電話番号', body: DISCLOSE_ON_REQUEST },
  {
    label: 'メールアドレス',
    body: (
      <P>
        <Anchor href={`mailto:${TERMS.contactEmail}`}>{TERMS.contactEmail}</Anchor>
        <br />
        お問い合わせはメールで受け付けています。
      </P>
    ),
  },
  {
    label: '販売価格',
    body: (
      <>
        <P>在籍スタッフ{FREE_STAFF_LIMIT}人までは無料です。</P>
        <P>
          {FREE_STAFF_LIMIT + 1}人目からは、1人あたり月額{PRICE_PER_STAFF_YEN}円（税込）です。例：
          {EXAMPLE_STAFF_COUNT}人のとき、月額{monthlyPriceYen(EXAMPLE_STAFF_COUNT).toLocaleString()}
          円（税込）。
        </P>
        <P>
          人数は、その月のうち、すべての店舗の在籍スタッフの合計が最も多かったときの人数で数えます（
          <Anchor href="/terms#price">利用規約「料金」</Anchor>）。
        </P>
      </>
    ),
  },
  {
    label: '販売価格以外にかかる費用',
    body: (
      <P>
        銀行振込でお支払いの場合の振込手数料。インターネットに接続するための通信料は、お客様のご負担となります。
      </P>
    ),
  },
  { label: 'お支払い方法', body: <P>クレジットカード、銀行振込</P> },
  {
    label: 'お支払い時期',
    body: (
      <>
        <P>毎月末に締めて、翌月にご請求します。</P>
        <P>
          クレジットカード：ご請求の時点でカードに請求します。引き落とし日は、各カード会社の規定によります。
          <br />
          銀行振込：請求書に記載した期日までにお振り込みください。
        </P>
      </>
    ),
  },
  {
    label: 'サービスの提供時期',
    body: <P>お申し込みの手続きが完了した時点から、すぐにご利用いただけます。</P>,
  },
  {
    label: '契約期間と更新',
    body: <P>有料プランは1か月ごとの契約で、解約のお手続きがない限り、毎月自動で更新されます。</P>,
  },
  {
    label: '解約・返金について',
    body: (
      <>
        <P>
          有料プランはいつでも解約でき、解約すると無料プランに戻ります。翌月以降の料金は発生しません。
        </P>
        <P>
          月の途中で解約した場合も日割りの計算はせず、解約した月の料金は、その月に在籍スタッフが最も多かったときの人数でご請求します。
        </P>
        <P>
          サービスの性質上、お支払いいただいた料金は、法令で返金が定められている場合を除き、返金いたしません。
        </P>
      </>
    ),
  },
  {
    label: '動作環境',
    body: (
      <P>
        最新版のGoogle Chrome、Safari、Microsoft
        Edge、Firefox。パソコン・スマートフォン・タブレットのブラウザでご利用いただけます。
      </P>
    ),
  },
]
