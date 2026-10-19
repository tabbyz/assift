# 032: 問い合わせの受信箱に Missive を入れる

- 前提: 016-terms §7 2026-10-13（連絡先 `support@assift.com`。Google Workspace `admin@sundbox.app` のエイリアス。`info@` も同じ受信箱）/
  017（委託先と外国への移転）/ 024・026（MX・SPF・DKIM は触らない）/ 029 §3.4・030（10/28 にポリシーの PDF を確定し、10/29 の告知で渡す）
- 参照: Missive の公式ドキュメント（2026-10-18 に取得。`administration/billing-and-plans`（+ faq）・`core-features/connected-accounts/email-accounts/gmail-google-workspace`（+ `configuring-google-aliases`）・
  `core-features/understanding-label-types`・`core-features/conversations/faq`・`core-features/connected-accounts/email-accounts/spam-and-blocking`・`ai/overview`・`ai/setup`・`ai/mcp/server`（+ faq）・
  `administration/security`（+ faq）、`missiveapp.com/privacy`・`missiveapp.com/gdpr`、ドキュメントの質問の窓口（`?ask=`）の回答）
- 経緯: 2026-10-18 の相談で受信箱を Missive に決めた（Help Scout・Plain と比較）。031（お問い合わせフォーム）のたたき台に含めていたが、
  2026-10-19 に**フォームの実装と切り分け**、リリースの前（**10/25〜10/26**）に入れることにした
- 予定: 10/25〜10/26 に設定と確かめ、ポリシーの差分を **10/27 の merge 止めまでに** main に入れる（10/28 の PDF に載せるため）
- 作業の分担: Missive の設定と確かめは利用者、ポリシーの差分は Claude

**状態: プラン（2026-10-19）。§7 の未決は 10/25 のトライアルで決める。**

## 1. 目的と完了条件

`support@assift.com` に届く問い合わせを、**Missive の iOS アプリで受けて返せる**ようにする。受信は今の Google Workspace のまま（MX は触らない）。
フォーム（031）はメールで `support@` に届くので、フォームがあってもなくても同じ受信箱で受けられる。

- [ ] `support@` / `info@` 宛てのメールが Missive に「assift」のラベル付きで届き、iOS アプリに通知が来る
- [ ] Missive から返すと、相手に `support@assift.com` から届く
- [ ] Reply-To の付いたメールに返すと、宛先が Reply-To になるかを確かめ、結果を 031 に申し送った（§4-1）
- [ ] プライバシーポリシーの委託先に Missive を足し、10/27 までに main に入った（§5）
- [ ] Missive と DPA を結ぶ依頼を出した（§5）
- [ ] トライアルが終わる前（11/24 ごろ）にプランを選ぶ予定を入れた（§3-2）

## 2. 範囲

### する

| # | 内容 | 担当 | 節 |
| --- | --- | --- | --- |
| 1 | Missive のトライアル・Gmail の接続・エイリアス・ラベル・通知・定型文 | 利用者 | §3 |
| 2 | 確かめ（Reply-To・差出人・会話のまとまり・添付・通知） | 利用者 | §4 |
| 3 | プライバシーポリシーの差分（委託先・外国の制度） | Claude | §5 |
| 4 | DPA の依頼・SOC 2 の報告書の取り寄せ | 利用者 | §5 |

### しない

- **お問い合わせフォーム**（031。別タスク）。サイトのアドレスの置き換えも 031
- **MX の変更・Missive に直接受けさせること**: 受信は Google Workspace のまま
- **AI の下書き・MCP サーバー**: 運用して返信の手間を感じてから（§7-3）。使うならポリシーの見直しが要る

## 3. 手順（10/25〜10/26。利用者）

1. **トライアルを始める**: 最初の組織に 30 日、Productive の機能。カードは要らない。**トライアルは人に付いて 1 回きり**。トライアル中は直近 30 日の履歴だけ見える
2. **Settings > Accounts > Add account > Gmail or Google Workspace** で `admin@sundbox.app` をつなぐ（Gmail の公式の OAuth の API。ラベルは双方向に同期）。
   個人のアカウントとして足す（1 人なので共有にしない）。取り込む履歴は「No history」か「1 month」
3. **エイリアス**: Google の管理コンソールのエイリアス（済み）と、Gmail の「Send mail as」の `support@`（016-terms §7 で済み）の両方が要る。
   Missive にだけ足すと Gmail が差出人を `admin@sundbox.app` に書き換える（Missive に「"From" address reverted」と出る）。両方そろっていれば、
   **`support@` 宛てのメールに返すとき Missive が `support@` を差出人に選ぶ**（ドキュメントの質問の窓口の回答。§4 で確かめる）
4. **assift のメールを分ける**: **Gmail のフィルタ**で、宛先が `support@assift.com` か `info@assift.com` のメールに「assift」のラベルを付ける。
   Gmail のフィルタは Missive より先にサーバーで走り、ラベルは Missive（iOS を含む）に出る。Starter でも使える。`sundbox.app` のほかのメールと受信箱を分けるなら、フィルタで「受信トレイをスキップ」も付ける
5. **通知**: iOS アプリを入れる。Starter では「このラベルだけ通知」ができない（通知の設定は種類ごと）。Productive ならルールの「Silence notifications」で `sundbox.app` のほかのメールの通知を止められる（§7-1）
6. よく使う返信を canned responses（定型文）にする
7. **トライアルの終わり（11/24 ごろ）の前にプランを選ぶ**（組織の持ち主がパソコンから。スマホのアプリではできない）。選ばないと組織が止まる（送れない・過去の会話が隠れる・通知が止まる。止まったままだとアカウントが外れ、データはいずれ消える）

### 運用の決まり

- **迷惑なメールを「Mark as spam」で弾くときは、差出人を確かめる**: Missive の迷惑メールの扱いは**差出人のアドレスかドメインをブロック**する。
  031 のフォームのメールは差出人が全部 `noreply@assift.com` なので、フォーム経由の迷惑な投稿でブロックすると**以後のフォームの問い合わせがすべて届かなくなる**（`assift.com` のドメインならなおさら）。フォームの迷惑な投稿は削除するだけにする
- **アカウントに関わる依頼（退会・データの削除・契約の変更）は、返信先とアカウントのアドレスが一致するかを確かめてから受ける**: フォームのメールの本文は、問い合わせの文のあとに区切り線とサーバーで確かめた情報（アカウント・店舗など）が続く。
  利用者は問い合わせの文に偽の「アカウント: …」を書けるので、本物は**いちばん最後の区切り線のあと**の行（031 §4.4）。一致しなければ、アカウントのアドレスからの連絡を求める

## 4. 確かめ（10/25〜10/26。利用者）

公式ドキュメントに書かれていないもの・質問の窓口の回答だけのものを、実機で確かめる。

| # | 確かめること | やり方 | 結果の行き先 |
| --- | --- | --- | --- |
| 1 | **Reply-To に返すか** | 別のアドレス A から、Reply-To を B にしたメールを `support@` に送り、Missive で返信を作る。宛先が B になるか | **031 の前提**。ならなければ 031 §9-7 で設計し直す |
| 2 | 差出人 | 1 の返信が、相手に `support@assift.com` から届く（"From" address reverted が出ない） | §3-3 |
| 3 | 会話のまとまり | 同じ差出人・別の Reply-To・別の件名のメールを 2 通送り、別の会話になる（Missive は件名ではなく Reply-To などのヘッダで会話をまとめる） | 031 §4.5 |
| 4 | 添付 | 画像を添付したメールが iOS アプリで見られる | 031 §4.7 |
| 5 | ラベルと通知 | Gmail のフィルタの「assift」のラベルが iOS アプリに出る。通知がどう来るか | §7-1 |

## 5. プライバシーポリシーの差分（Claude。10/27 までに merge）

10/30 に制定するポリシー（10/28 に PDF を確定）に、最初から Missive を載せる。制定の前なので改定ではない。

| 箇所 | いま | 差分 |
| --- | --- | --- |
| 6. 委託先 | 「Google（米国）：お問い合わせのメールの受信と保管（Google Workspace）」 | 残したうえで「Missive（カナダ。データは米国のサーバーに保存）：お問い合わせへの対応」を足す |
| 6. 外国の制度 | 「米国における個人情報の保護に関する制度は、個人情報保護委員会の調査で…」 | 「米国とカナダにおける…」。リンク先（`PPC_FOREIGN_SURVEY_URL`）は国ごとの頁の一覧なのでそのまま |
| 6. 要約 | 「サーバー、AI、決済などの業務を、主に米国の事業者に委託しています。」 | そのまま（Missive のデータも米国。「主に」で読める） |

- ファイル: `src/app/(public)/(site)/privacy/_components/sections.tsx`。017 のプランに追記する
- 外国にある第三者は**運営会社の所在地**で見る（Heliom Inc.・カナダ）。データの置き場所（米国）も書く
- **基準に適合する体制**（本文の「日本の法律と同等の水準で…体制が整っていることを確認したうえで委託」）の根拠として、Missive と **DPA** を結ぶ（`privacy@missiveapp.com` に依頼）。SOC 2 Type II の報告書も取り寄せる（`security@missiveapp.com`）。結べるまでに日数がかかるので 10/25 に依頼を出す
- 10/27 までに merge できなければ、**リリースの前には Missive を使わない**（Gmail のまま受け、リリース後にポリシーを改定してから使う）

## 6. Missive について確かめたこと（公式ドキュメント。2026-10-18）

| 項目 | 内容 |
| --- | --- |
| プラン | Starter（年払いで月 $14 / 月払いで $18。5 人まで。連携・ルール・API・AI なし）/ Productive（$24 / $30。50 人まで。すべてあり・分析は基本）/ Business（$36 / $45）。1 人あたり。**無料プランは無い** |
| トライアル | 最初の組織に 30 日・Productive の機能・カード不要。人に付いて 1 回きり。履歴は直近 30 日 |
| プランの変更 | 組織の持ち主がパソコンから |
| AI | Productive 以上。OpenAI・Anthropic・Google Gemini。自分の鍵なら上乗せなし、Missive のクレジットなら 25% 上乗せ（最初に $5 分）。返信の下書き・要約・翻訳・定型文の検索・届いたメールで AI を走らせるルール |
| MCP サーバー | `https://mcp.missiveapp.com`。Claude などから会話の検索・下書き・送信（Productive 以上・管理者が有効にする）。Missive のクレジットは使わない。「Send messages」を渡さなければ下書きまで |
| 運営会社 | Heliom Inc.（カナダ・ケベック） |
| データの置き場所 | AWS。サーバーは現在すべて US East 1（米国・バージニア北部）。データベースは Crunchy Data（米国） |
| 安全管理 | SOC 2 Type II（報告書は請求すれば出す）。Google の OAuth API の検証を通過。通信は TLS、保存時も暗号化 |
| Missive の委託先 | AWS・Google・Cloudflare・Crunchy Data・Stripe・Segment・Mixpanel・Anthropic（Missive 自身のサポート）など。ニュースレターの Campaign Monitor（豪州）のほかは米国 |
| DPA | `privacy@missiveapp.com` に頼めば結べる |
| 書かれていないこと | Reply-To のあるメールに返したときの宛先（質問の窓口も「見つからない。送る前に下書きの宛先を確かめて」）→ §4-1 |

## 7. 未決（10/25 のトライアルで決める）

| # | 項目 | 選択肢 | おすすめ |
| --- | --- | --- | --- |
| 1 | プラン | (a) Starter（年払いで月 $14）/ (b) Productive（年払いで月 $24）/ (c) `support@` 専用の Workspace のユーザーを作って Starter でつなぐ | **(b)**。Starter は**ラベルごとに通知を絞れない**ので、`sundbox.app` のメールまで通知される。Productive ならルールで止められ、AI と MCP サーバーも使える。(c) は Workspace の 1 人分が増え、合計は (b) とほぼ同じ |
| 2 | 年払いか月払いか | 年払い（20% 安い）/ 月払い | 最初の数か月は月払いで様子を見て、続けると決めたら年払い |
| 3 | AI の下書き・MCP サーバー | 使わない / Missive の AI（自分の鍵）/ MCP サーバー（Claude から下書き） | 運用して返信の手間を感じてから。使うならポリシーの「AI の提供元」の文を見直す |

## 8. 実装ログ

（実施後に追記する）
