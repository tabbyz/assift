import type { ReactNode } from 'react'
import { Anchor } from '@mantine/core'
import { FREE_STAFF_LIMIT, PRICE_PER_STAFF_YEN, monthlyPriceYen } from '@/lib/billing/pricing'
import { TERMS } from '../../terms/_components/terms'
import { LAW } from './law'

/**
 * 特定商取引法に基づく表記の各項目（018 §3）。役務（サービス）の通信販売として、法 11 条と施行規則が求める事項を並べる。
 *
 * 見やすさは v1 にならう（018 §7 2026-10-07）: `value` は結論だけを 1〜2 行で書き、条件や例は `note`（小さい字）に回す。
 * ラベルはスマホ幅で折り返さない 7 文字以内にする。
 * 料金・解約の中身は利用規約「料金」（016）と食い違わないように書き、数字は `lib/billing/pricing` から引く。
 * 住所・電話番号は「ご請求があれば遅滞なく開示」で省略する（法 11 条ただし書。価格を全部表示していることが前提）。
 */
export type LawItem = { label: string; value: ReactNode; note?: ReactNode }

/** 料金の例に使う人数 */
const EXAMPLE_STAFF_COUNT = 15

/** 住所・電話番号（と、`sellerName` が null のときの氏名）を省略するときの表示。請求の方法は表の下に書く */
const DISCLOSE_ON_REQUEST = 'ご請求があれば遅滞なく開示します'

export const LAW_ITEMS: LawItem[] = [
  { label: '販売事業者', value: LAW.sellerName ?? DISCLOSE_ON_REQUEST },
  { label: '所在地', value: DISCLOSE_ON_REQUEST },
  { label: '電話番号', value: DISCLOSE_ON_REQUEST },
  {
    label: 'メールアドレス',
    value: <Anchor href={`mailto:${TERMS.contactEmail}`}>{TERMS.contactEmail}</Anchor>,
  },
  {
    label: '販売価格',
    value: (
      <>
        スタッフ{FREE_STAFF_LIMIT}人までは無料
        <br />
        {FREE_STAFF_LIMIT + 1}人目から1人につき月額{PRICE_PER_STAFF_YEN}円（税込）
      </>
    ),
    note: (
      <>
        例：{EXAMPLE_STAFF_COUNT}人なら月額{monthlyPriceYen(EXAMPLE_STAFF_COUNT).toLocaleString()}
        円。人数は、その月に全店舗の在籍スタッフが最も多かったときで数えます（
        <Anchor href="/terms#price" inherit>
          利用規約「料金」
        </Anchor>
        ）
      </>
    ),
  },
  { label: 'その他の費用', value: '銀行振込の手数料、インターネットの通信料' },
  { label: '支払い方法', value: 'クレジットカード、銀行振込' },
  {
    label: '支払い時期',
    value: '毎月末に締め、翌月にご請求',
    note: 'クレジットカードの引き落とし日は、各カード会社の規定によります。銀行振込は、請求書に記載した期日までにお振り込みください',
  },
  { label: '提供時期', value: 'お申し込み後、すぐにご利用いただけます' },
  { label: '契約期間', value: '1か月ごと（自動更新）' },
  {
    label: '解約',
    value: 'いつでも解約でき、無料プランに戻ります',
    note: '月の途中で解約しても日割りの計算はせず、その月の料金をご請求します',
  },
  {
    label: '返金',
    value: 'サービスの性質上、返金には応じられません',
    note: '法令で返金が定められている場合を除きます',
  },
  {
    label: '動作環境',
    value: '主要なブラウザの最新版',
    note: 'Google Chrome、Safari、Microsoft Edge、Firefox。パソコン・スマートフォン・タブレットで使えます',
  },
]
