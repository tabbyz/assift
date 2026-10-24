# 035: Stripe の live の準備（鍵・`stripe:setup`・Dashboard・Webhook・Vercel の環境変数）

- 前提: 019 §4.1（Stripe の構成・制限付きキー）・§8.3-1・2（事前の作業）/ 024 §4.7（Vercel の Production の環境変数。Stripe の 3 つはこのプランで入れる）/
  026 §3-11（Webhook の URL は `v2.assift.com`）・§4-2（ゲート。期限 10/27、`stripe:setup` と移行用の鍵は 10/22）・§5（10/23 の dry-run の計測）・§7.2・§11-3（鍵）/
  033 §3.2（監視 ③ は初回の cron のログを見てから有効にする）
- 参照（2026-10-21 に読んだ）: Stripe の「API keys」（live の鍵は作ったときに 1 回だけ表示される。制限付きキーはいくつでも作れ、権限はあとから **Edit key** で直せる）/
  「Restricted API keys」（サンドボックスで同じ権限の鍵を試してから live に作る手順。権限が足りない呼び出しはエラーの本文が足す権限を言う。鍵ごとの **View request logs**）/
  「Receive Stripe events in your webhook endpoint」（Workbench の送信先は **Thin** が推奨の既定で、**Snapshot** を選んだときだけ API の版を選べる。
  手動の再送は Dashboard の **Resend** が作成から 15 日、CLI の `stripe events resend <evt> --webhook-endpoint=<we_…>` が 30 日。live では失敗した配信を 3 日まで再送する）
- コード: `scripts/stripe/setup.ts` / `src/app/api/stripe/webhook/route.ts` / `src/app/api/cron/billing-usage/route.ts` / `src/lib/billing/{stripe,sync,report}.ts` / `.env.example`
- 経緯: 2026-10-20 にリリース計画のタスク「Stripe 本番: stripe:setup・Webhook 登録・解約メールを一時オフ」の現状を調べ、2026-10-21 に §3 の決定（すべて推奨の案）を受けた

**状態: 完了（2026-10-24。§1 の完了条件をすべて満たした。当夜の操作は 026 §6・手順書）。プラン確定は 2026-10-21（レビュー 5 回。5 回目で高・中 0 件で収束）。作業するのは人間（Stripe・Vercel の操作と秘密の値）。サンドボックスでの鍵の権限の確かめ（§5.3）と記録は Claude。**

## 1. 目的と完了条件

カットオーバー（026。10/30）の前に、live の Stripe と v2 の本番（`v2.assift.com`）をつなぐ。当夜にするのは Webhook の無効化・有効化と URL の変更、
リトライの設定の切り替えだけにし、鍵・price・Webhook の登録・環境変数は前もって済ませて確かめておく。

- [x] live に `assift_monthly`（price）・`assift_v1_legacy`（クーポン）・Meter・ポータルの設定がある（`stripe:setup`。**10/22 まで**）
- [x] 鍵が 2 本ある（アプリ用・移行用。§3-1）。どちらもパスワードマネージャにあり、権限はサンドボックスで確かめたものと同じ（§5.3）
- [x] Dashboard の設定が 019 §4.1 のとおりで、**解約の確認メールが送られない**（標準の設定は無く、売上回収のオートメーションも無い。§3-4）、**リトライが尽きたときは「未払いにする」のまま**（§5.4）
- [x] Webhook のエンドポイントが `https://v2.assift.com/api/stripe/webhook`・Snapshot・`2026-09-30.endive`・7 種類のイベントで登録され、有効
- [x] Vercel の Production（だけ）に `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET` があり、Redeploy した
- [x] 鍵付きの cron が 200、再送した Webhook の配信が 204（§6）
- [x] その夜の Vercel の cron（23:20・23:50）が 200 で、Axiom に `[billing] 定期実行` が 2 行届く（033 の監視 ③ の前提）
- [x] 026・019・024・`.env.example`・リリース計画・カットオーバー手順書に結果を写した（§8）

## 2. 範囲

### する

| # | 内容 | 節 |
| --- | --- | --- |
| 1 | 鍵を決めて作る（live 2 本。サンドボックスに同じ権限の 2 本） | §3-1・§4・§5.1・§5.3 |
| 2 | live で `npm run stripe:setup` | §5.2 |
| 3 | Dashboard の設定の確認と、解約の確認メールが送られないことの確かめ | §5.4 |
| 4 | Webhook の登録 | §5.5 |
| 5 | Vercel の環境変数と Redeploy | §5.6 |
| 6 | 確かめ（cron・Webhook・その夜の cron） | §6 |
| 7 | 10/23 の dry-run の計測は既存のタスク（cutover-25）で行うと決める | §3-6 |

### しない

- 10/24〜10/29 の移行しない人の Subscription の即時解約（026 §3-15。cutover-26）。解約の確認メールは送られない（§3-4）
- 当夜の操作（Webhook の無効化 → 有効化・URL を `assift.com` へ・リトライが尽きたら「解約する」・解約後の請求書の扱い・決済手段の更新のリンク・3D セキュアのメールと確認待ちの扱い（§3-8・§3-9））→ 026 §6
- `stripe:migrate-v1` の dry-run の計測そのもの（10/23。§3-6 のとおり cutover-25 で行う。鍵はこのプランで作る）
- live での申し込み（Checkout）の試し。本物のカードで請求が走る。Checkout の経路はサンドボックスで確かめる（§5.3）
- アカウントの既定の API の版（`2019-08-14`）を上げること。v1 が動いている。版を指定するのは Webhook のエンドポイントだけ（019 §12 2026-10-08）
- 移行用の鍵の失効（11/1 の請求の突き合わせ（019 §8.3-5）が済んでから。リリース計画の「リリース後」に足す。§8）

## 3. 決定（2026-10-21。すべて 2026-10-20 の調べで推奨した案）

| # | 項目 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | 鍵 | **live に制限付きキーを 2 本**: `assift-v2-app`（Vercel の `STRIPE_SECRET_KEY`。§4.1 の最小の権限）と `assift-v2-migration`（手元の Mac から `stripe:setup`・`stripe:migrate-v1`・`stripe:sync-all` を流す。§4.2）。v1（Heroku）の標準の `sk_live` は使わず、roll もしない | Vercel の鍵に setup・移行の権限を乗せない（019 §4.1「`stripe:setup` と移行スクリプトは別の鍵で流す」）。全権限の鍵を手元で使わない。移行用はカットオーバーの後に失効させられる |
| 2 | 当夜 23:25 の `stripe:sync-all` の鍵 | **移行用の鍵**（026 §11-3 を確定。§6.3 23:25 の `'<鍵>'` を `'<移行用の鍵>'` に） | 当夜に Stripe へ流すコマンド（23:00・23:05・23:10・23:25）がすべて同じ鍵になり、取り違えが減る。移行用は同期に要る権限（§4.1 の同期の行）を含む。なお、カットオーバーまでの毎晩の cron でアプリ用の鍵について確かめられるのは**一覧の読み取りだけ**（v1 の Customer は持ち主が引けず、`customers.update`・`subscriptions.cancel` は走らない。v1 の契約に schedule は無い）。書き込みの権限はサンドボックス（§5.3）で確かめる |
| 3 | 権限の確かめ方 | **サンドボックス（019 の `assift-v2-dev`）に同じ権限の制限付きキーを 2 本作り、Claude がクラウドのセッションで通す**（§5.3）。live の鍵はその権限に合わせる | 019 §9.4 の確認はすべて `sk_test` で、制限付きキーは一度も試していない。cron と Webhook の確かめ（§6）は同期の経路しか通らず、申し込み・ポータル・人数の送信・退会・引き継ぎの `--apply` は当夜以降に初めて動く。Stripe の手順（Restricted API keys「Create a restricted API key in a sandbox」）もサンドボックスが先 |
| 4 | 解約メール | **2026-10-22 に改めた: 止めるものが無い。** Stripe の設定画面に解約の確認メールの標準のオン・オフは無く（送るなら売上回収 → オートメーションで「サブスクリプションがキャンセルされた」から作る）、live にそのオートメーションは無かった。026 §5 の 10/29 の確認は「オートメーションが無いまま」にする。当夜 23:30 に戻すものも無い | 当初（10/21）は「このプランでオフにする」と決めたが、019 §8.3-2 の前提（オン・オフの設定がある）が実物と違った。解約の一斉のメールは、もともと出ない |
| 5 | Webhook の確かめ | **既存のイベントの再送**（Dashboard の Resend。15 日以内のイベント）。v1 の実際のイベントを待たない | 処理する 7 種類のイベントは月末まで少なく、待つと 10/27 に間に合わない。live で `stripe trigger` は本物のオブジェクトを作るので使わない |
| 6 | 10/23 の dry-run の計測 | **リリース計画の 10/23 の 1 日のタスク（cutover-25。026 §3-15 と一緒に 2026-10-21 に別のセッションが足した）で行う**。通しのリハーサル（cutover-14）のメモから外す | 026 §5 の期限は 10/23、§11-5（Stripe の段が 25 分に収まらないとき）の判断は 10/29 の告知の前。10/26〜27 では判断の余裕が無い |
| 8 | 顧客へのメールの「決済手段の更新」のリンク（2026-10-21 に §5.2-0 の確かめで見つけた） | **当夜 23:30 に「Stripe 上のページにリンク」へ変える**（026 §6.3 23:30・手順書）。**あわせて v2 に `/card/edit`（と `/card` の配下）→ `/account/billing` の一時的な転送を足す**（§10。別の PR。10/27 のマージ停止の前に main へ） | 今は「両方を組み合わせて使用（レガシー）」で、カード支払いの失敗は `https://assift.com/card/edit`（v1 のページ）を指す。v2 にこのページは無く、カットオーバーの後は 404 になる。10/31 の期間の終わりに救った `unpaid` の 47 件が期限切れのカードで失敗し、メールからカードを更新する想定（019 §8.2.2）が崩れる。Stripe 上のページはログイン無しで更新できる。今変えないのは、v1 が動いているあいだ v1 の `/card/edit` で更新できているため。転送は、23:30 より前に送られたメールのリンクを後から押す人のため |
| 9 | 3D セキュアの認証のリンクのメールと、確認待ちの決済の扱い（2026-10-22 に §5.4 の確かめで見つけた） | **当夜 23:30 に**、「確認が必要な決済」の送信メール（Stripe が提供するリンクを送る）を**オン**にし、サブスクリプションのステータス（15 日）を「未払いとしてマーク」から**「キャンセル」**へ、請求書のステータスはリトライが尽きたときの請求書と同じ扱い（「回収不能にする」を推奨。026 §6.3 23:30）にそろえる | 今はメールがオフで、019 §4.4（3D セキュアの認証のリンクを送る）の前提と違う。15 日で「未払い」のままだと請求書の下書きが溜まる（v1 の 134 件と同じ形）。v2 の画面では未払いも解約もロックで同じ。今変えないのは、v1 が動いているあいだの動きを変えないため（§3-8 と同じ） |
| 7 | 実行する場所 | `stripe:setup` と live の操作は**あなたの Mac と Dashboard**。live の鍵の値はチャットにもクラウドのセッションにも渡さない。サンドボックスの `rk_test_` だけクラウドの環境の環境変数に入れる（§5.3） | 秘密の値の扱い（021 §11・026 §5 と同じ） |

## 4. 鍵の権限

Stripe の画面の資源の名前は表記が変わりうる。下の表の「呼び出し」に当たる行を選ぶ。足りなければ、その呼び出しのエラーの本文が足す権限を言う（Stripe の「Restricted API keys」）。
**Write は Read を含む。** 最終の一覧はサンドボックス（§5.3）の結果で確定し、`.env.example` と 019 §4.1 を直す（§8）。

### 4.1 アプリ用（`assift-v2-app`。Vercel）

| 資源 | 権限 | 呼び出し（コード） |
| --- | --- | --- |
| Customers | Write | `customers.retrieve` / `create` / `del`（`lib/billing/customer.ts`）・`retrieve` / `update`（`sync.ts`。Webhook と同期・メールの更新）・一覧の `expand: ['data.customer']`（`sync.ts`） |
| Checkout Sessions | Write | `checkout.sessions.create`（`account/billing/actions.ts`） |
| Subscriptions | Write | `subscriptions.list` / `cancel`（`sync.ts` の一覧と二重契約の解約）・`list` / `update`（`cancel.ts` の退会）・`retrieve`（`account/billing/actions.ts` の `cancelDuringMigration`） |
| Subscription Schedules（画面に別の行があれば） | Write | `subscriptionSchedules.retrieve` / `release` / `update`（`cancel.ts`。切り替え待ちの解約・退会）・同期の `expand: ['data.schedule']`（`sync.ts`） |
| Prices | Read | `prices.list`（`resolvePriceId()`） |
| Billing Meter Events | Write | `billing.meterEvents.create`（`usage.ts`） |
| Customer portal（Billing Portal の Sessions） | Write | `billingPortal.sessions.create`（`(protected)/actions.ts`） |
| Coupons（または Discounts） | **Read（必須。外さない）** | 同期の `expand: ['data.discounts']`（`sync.ts`）。切り替え待ちのあいだ Subscription の `discounts` は空で（50% は schedule の次の phase から読む。`subscriptionRow.ts`）、中身のある割引を展開するのは phase 1 が始まった後だけ。live で初めて通るのは 11/1 0:00 の切り替え（392 件の Webhook が一斉に走る）なので、外して確かめることはしない。§5.3-10 で Read で足りることだけ確かめる |
| Invoices | **None**（2026-10-22 に §5.3 で、None のまま全部の経路が通った。`src/` に呼び出しが無い） | — |

### 4.2 移行用（`assift-v2-migration`。手元の Mac）

§4.1 の Customers・Subscriptions・Subscription Schedules・Prices・Coupons に加えて:

| 資源 | 権限 | 呼び出し |
| --- | --- | --- |
| Products | Write | `products.retrieve` / `create`（`setup.ts`） |
| Billing Meters | Write | `billing.meters.list` / `create`（`setup.ts`） |
| Prices | **Write** | `prices.create`（`setup.ts`） |
| Coupons | **Write** | `coupons.retrieve` / `create`（`setup.ts`）・`retrieve`（`migrate-v1`） |
| Customer portal の設定（Billing Portal の Configurations） | Write | `billingPortal.configurations.list` / `create` / `update`（`setup.ts`） |
| Invoices | Write | `invoices.list` / `update` / `finalizeInvoice` / `voidInvoice` / `markUncollectible`（`migrate-v1`） |
| Customers・Subscriptions・Subscription Schedules | Write | `migrate-v1`（言語の設定・schedule・解約）と `sync-all`（メールの更新・二重契約の解約） |

Checkout Sessions・Billing Meter Events・Customer portal の Sessions は要らない（当夜の 3 つのスクリプトは呼ばない）。

## 5. 手順

順序の制約は 1 つ: **live の `stripe:setup`（§5.2）を Vercel の環境変数（§5.6）より先に**。cron と申し込みは `resolvePriceId()` で `assift_monthly` を引くので、
price が無いまま鍵が入ると、毎晩の cron が「price が見つかりません」の 500 になる（`lib/billing/stripe.ts`）。
`CRON_SECRET` も Stripe と同時に入れる（024 §4.7。`CRON_SECRET` だけだと毎晩 503）。

| いつ | 誰 | 手順 |
| --- | --- | --- |
| 10/21 | あなた | §5.1 移行用の鍵（live）→ §5.2 setup → §5.4 Dashboard。§5.3 のサンドボックスの鍵も作って環境に入れる |
| 10/21〜22 | Claude | §5.3 サンドボックスで 2 本の鍵の権限を通す。足りない権限を見つけたら、live の 2 本に足すものを伝える |
| 10/22（§5.3 の後） | あなた | §5.1 アプリ用の鍵（live。§5.3 で確かめた権限）→ §5.5 Webhook → §5.6 Vercel → §6.1・6.2 の確かめを**続けて**。移行用の鍵に足す権限があれば Edit key |
| 10/22 の夜〜10/23 の朝 | あなた（Claude はクエリの文面と記録） | §6.3 その夜の cron と Axiom を見る → 033 の監視 ③ を有効にする。Axiom・Vercel の画面はあなたが操作する（クラウドのセッションには道具が無い） |
| 10/22 に §5.3 が終わらないとき | あなた | アプリ用の鍵を §4.1 の一覧のまま作って §5.5・§5.6 へ進み、§5.3 の結果で Edit key する（Vercel の 3 つの期限は 10/27。026 §4-2） |
| 10/23 | あなた | cutover-25（§3-6）: `stripe:migrate-v1` の dry-run をリハーサルの CSV で live に流して所要を測る（移行用の鍵） |

### 5.1 live の鍵を作る（Dashboard → Developers → API keys → Create restricted key）

1. 名前 `assift-v2-migration`、§4.2 の権限で作る。表示された値をすぐパスワードマネージャに入れる（**live の鍵は作ったときに 1 回しか表示されない**）。
   Note の欄に保管場所を書く
2. `assift-v2-app` は §5.3 が済んでから、確かめた権限で作る（10/22）。サンドボックスの `assift-v2-app-test` の権限の画面と並べて、行ごとに見比べる。同じくすぐ保管する
3. 既存の鍵（v1 が使っている標準の `sk_live`）には触らない。roll すると v1 が止まる

### 5.2 live で `stripe:setup`（あなたの Mac。最新の `main`）

0. 先に Dashboard で 2 つ見る:
   - 商品カタログで、v1 の Product の ID が **`assift`** か（`prod_…` なら setup は別の Product `assift` を作る。害は無いが、作られたら記録する）
   - Settings → Billing → **Customer portal** の今の設定（機能の各項目）と、顧客へのメールのリンク先（ポータルに向いているか）。§9 に控える。
     **ポータルの設定が一度も保存されていなければ（既定の設定が無ければ）、この画面で 1 回保存して既定の設定を作ってから setup を流す。**
     API で作った設定は既定にならない（`is_default: false`）。setup は既定が無いと毎回新しい設定を作り（`setup.ts` の `ensurePortal`）、
     アプリの `openPortal` は設定を指定せず既定に頼るので（`(protected)/actions.ts`）、カットオーバーの後に「お支払い方法・請求書・解約」が開けなくなる。§6 では live でポータルを試さないので気付けない。
   - setup はアカウントの**既定の設定**の機能を上書きする（期間の終わりの解約を有効にする。`setup.ts` の `ensurePortal`）。v1 はポータルのリンクを出していないが、
     メールのリンク先がポータルなら v1 の利用者にも効く。1 回目の出力が「更新」だったら、上書きの前の値を控えてあることを確かめる。
     **リンク先がポータルでも受け入れる**（10/30 まで v1 の利用者がポータルで期間末の解約を予約できるようになるが、利用者の正当な操作）。
     当夜の 23:00 の dry-run と 23:10 の結果で、解約の予約が入った契約が失敗していれば Dashboard で見る（期間の終わりで終わるので、旧料金への切り替えは要らない）
1. 流す（鍵はこの行で渡す。`.env.local` に書かない）:
   ```
   STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:setup
   ```
   期待する出力: `Stripe（live）を設定します` / `Product: assift（既存）` / `Meter: mtr_…（作成）` / `Price: price_…（作成）` / `Coupon: assift_v1_legacy（作成）` / `Portal: bpc_…（更新）` / `完了。Webhook の登録と…`
   Portal が **`（作成）`** と出たら止める（既定の設定が無かった）。Dashboard でポータルの設定を保存して既定を作ってから流し直す。止まった回の `bpc_…` は使われない設定として残る（害は無い。§9 に控える）
2. もう 1 回流し、Product・Meter・Coupon が「既存」、Price が `（既存。lookup_key: assift_monthly）`、Portal が **直前の回と同じ `bpc_…`** で「更新」になる（冪等）
3. 権限のエラーで止まったら、エラーの本文が言う権限を Edit key で足して流し直す
4. Dashboard で見る: Meter の集計が `last`・customer_mapping が `stripe_customer_id`、Price の `lookup_key: assift_monthly`・tiers が 10 人まで 0 円 / 以降 100 円・税込（inclusive）、
   Coupon `assift_v1_legacy` が 50%・forever・名前「旧料金（v1 からのご継続）」、ポータルが請求書・支払い方法・宛名・期間の終わりの解約・プラン変更なし（019 §9.4-1 と同じ）

### 5.3 サンドボックスで鍵の権限を確かめる（Claude。クラウドのセッション）

**あなたが用意すること**

1. Stripe のサンドボックス `assift-v2-dev`（019 §9.4 で使ったもの）で、制限付きキーを 2 本作る: `assift-v2-app-test`（§4.1。Coupons は Read、Invoices は None）と
   `assift-v2-migration-test`（§4.2）
2. クラウドの環境の環境変数に入れる: `STRIPE_APP_TEST_KEY`（`rk_test_…`）と `STRIPE_MIGRATION_TEST_KEY`（`rk_test_…`）。今ある `STRIPE_SECRET_KEY`（`sk_test_`）は残す（確かめの土台を作るのに使う）。
   チャットには貼らない。環境の変更は新しいセッションから効くので、入れたら新しいセッションで「035 §5.3 をして」と頼む
3. Claude が頼んだら、サンドボックスの「すべての再試行が失敗したら」を一時的に**未払いにする**へ変え（6 の `verify/v1.ts unpaid-setup` を流し終えるまで。019 §12 2026-10-08 と同じ）、
   終わったら**キャンセル**に戻す。Claude は Dashboard を操作できない。**サンドボックスの設定であって live ではない**ことを画面の上で確かめる

**Claude がすること**（019 §9.4 の道具を使う。鍵の値は表示しない。`rk_test_` で始まることだけ見る）

| # | 経路 | 鍵 | 見ること |
| --- | --- | --- | --- |
| 0 | 準備: docker → `supabase start`（AGENTS.md「クラウドのセッション」）→ `.env.local`（Supabase の 3 つ・`STRIPE_WEBHOOK_SECRET`・`CRON_SECRET`。Stripe の鍵は書かない）/ Playwright | — | Playwright はリポジトリの依存に無いので `npm i --no-save playwright@1.56.1` で一時的に入れる（環境の Chromium（`/opt/pw-browsers` の `chromium-1194`）に合う版。版を付けないと最新が入り、起動に失敗する。`playwright install` はしない） |
| 1 | `npm run stripe:setup` | 移行用 | 2 回とも通る（サンドボックスは既存なので、作成の権限は live の §5.2 で確かめる） |
| 2 | 新しく作った利用者 A（一時スクリプトの `auth.admin.createUser` でパスワード付き・`email_confirm: true`（`verify/lib.ts` と同じ。付けないと確認前の利用者になりログインできない）で作る。画面からの登録は確認メールが要り、Mailpit を外しているので進めない。seed の `dev@example.com` は使わない。5 で消すと seed の店舗ごと消える）で申し込み（Checkout）→ 戻ったときの同期 → ポータルを開いて**解約まで** | アプリ用 | 019 §9.4-2 のとおり。Playwright でテストカード |
| 3 | Webhook（A の Customer の `customer.subscription.created` / `updated` に署名を付けて dev サーバーへ POST） | アプリ用 | 204・`synced_at` が進む・Meter にイベントが届く（019 §9.4-3）。**イベントの取得（`stripe.events.list`）は土台のプロセス（`sk_test`）で行う**（Events の権限はアプリ用の鍵に無く、要らない。live の鍵に Events を足す結論にしない） |
| 4 | cron（`/api/cron/billing-usage`） | アプリ用 | 200・`failed` が 0（同期と人数の送信） |
| 5 | A の退会（019 §5.8 の解約）を画面から。前提は 2 でポータルから解約済み（解約の予定（`cancel_at`）が無いと退会は断られる。`entitlement.ts`） | アプリ用 | 019 §9.4-6 のとおり（endive のポータルは `cancel_at` だけを入れるので、退会で `subscriptions.update` が走る） |
| 6 | v1 相当の契約を作る: `verify/v1.ts setup <CSV-A>`（legacy / legacy-cancel / free）と `verify/v1.ts unpaid-setup <CSV-B>`（rescue / unpaid-old / unpaid-free。あなたの「用意すること」3 の切り替えのあいだに流す） | `sk_test` | 019 §9.4-5 のとおり。どれもテストクロック付き |
| 7 | `stripe:migrate-v1` の dry-run → `--apply --limit 1` → `--apply`（6 の CSV ごとに。**`--output` は CSV ごとに分ける**。省くとリポジトリの直下の `v1-subscriptions-result.csv` に上書きされる） | 移行用 | 019 §9.4-5 のとおり。`unpaid` の救済（`invoices.list` / `update` / `finalizeInvoice` / `voidInvoice` / `markUncollectible`）を必ず通す（当夜の判断点 B の後に live で初めて使う権限） |
| 8 | 結び付け: ログインできる利用者 B（legacy-cancel 用）と C（legacy 用）を新しく作り（2 と同じ作り方）、`profiles.stripe_customer_id` と `trial_end` を psql で写す（`verify/v1.ts advance` と同じ値）→ それぞれの Customer の Webhook を dev サーバーへ POST して行を作る | アプリ用 | `billing_subscriptions` に `has_schedule = true` の行ができる。**`verify/v1.ts advance` は使わない**（`sk_test` のまま同じプロセスで同期し、legacy-cancel を解約し、クロックを進めてしまう。引き継ぎは Stripe にしか書かないので、7 だけでは行が無い） |
| 9 | B でログインし、切り替え待ちの解約（`cancelDuringMigration()`）を画面から | アプリ用 | 019 §9.4-5 のとおり |
| 10 | 割引の展開: C の契約のクロックを phase 1 の後まで、`verify/lib.ts` の `advance()` だけを呼ぶ一時スクリプトで進め（`sk_test`）、C の Customer の Webhook を dev サーバーへ POST | アプリ用 | 204・行の `has_schedule` が **false**（release の後）・`discount_percent` が 50・Stripe 側でその Subscription の `discounts` が空でない（`sk_test` で見る）。schedule が残っていると、展開した `discounts` を通らずに phase の割引から 50 になる（`subscriptionRow.ts`）ので、`has_schedule` で確かめる。legacy-cancel（B）は phase 0 の終わりで終わるので使わない |
| 11 | 全員の同期: **クロックの無い** v1 相当の契約（acacia・`freemium-monthly`）を一時スクリプトで 1 件作り（`sk_test`。既存の道具は必ずテストクロックを付ける）→ `migrate-v1 --apply`（移行用）→ 利用者 D を作って `profiles.stripe_customer_id` だけ写す → `stripe:sync-all` | 移行用 | `failed: 0`・D の行が**一覧の経路で**できる（026 §7.3 と同じ。price で絞った一覧はクロック付きの契約を返さないので、6 の契約では当夜と同じ経路を通らない。取り直しのループは新しい行を作らない） |

- **鍵の渡し方**（3 つの起動の仕方で違う）:
  - `npm run dev`: Next は既にある環境変数を `.env.local` より優先する。環境には `STRIPE_SECRET_KEY`（`sk_test_`）があるので、起動の行で上書きする:
    `STRIPE_SECRET_KEY="$STRIPE_APP_TEST_KEY" npm run dev`（`.env.local` に書いても `sk_test_` で動き、権限が足りなくても全部通ってしまう）
  - `scripts/stripe/verify/*`（`tsx --env-file=.env.local`）: `--env-file` も既にある環境変数を上書きしないので、そのまま流せば `sk_test_`（土台に欲しい鍵）で走る
  - `npm run stripe:*`: `.env.local` を読まない。起動の行で渡す:
    `STRIPE_SECRET_KEY="$STRIPE_MIGRATION_TEST_KEY" npm run stripe:migrate-v1 -- …`（`setup` も同じ）。`sync-all` はローカルの `NEXT_PUBLIC_SUPABASE_URL` と `SUPABASE_SECRET_KEY` も同じ行で渡す
- **土台とアプリの経路を別のプロセスに分ける。** `scripts/stripe/verify/` は `getStripe()` の 1 つのクライアントで、土台の作成（テストクロック・支払い方法・v1 の plan・請求書の支払い）と
  `syncCustomer()` などを同じプロセスで呼ぶ。土台は `sk_test` の `verify/*` で作り、アプリの経路は HTTP（画面・署名した Webhook の POST・cron の GET）を
  アプリ用の鍵で起動した dev サーバーに送って通す。HTTP で通せないものだけ、2 つのクライアントを持つ一時スクリプトにする
- **本当に制限付きキーで走ったかを確かめる。** サンドボックスの鍵ごとの **View request logs** に、その経路のリクエストが出ていること（出ていなければ `sk_test` で走っている）。
  request logs はあなたに Dashboard で見てもらう
- 権限が足りない呼び出しはエラーの本文で分かる。足りない権限・要らなかった権限（Invoices）を一覧にしてあなたに伝え、サンドボックスの鍵を直してもらって通し直す
- 結果は §9 に書く。確認用の一時スクリプトはコミットしない。片付け: 作ったテストクロックを消す（クロックの Customer と Subscription も消える。019 §9.4-7）。
  クロックの無い 2 の Checkout の Customer と 11 の Customer は残るので消す（Subscription も一緒に消える。残すと後のローカルの同期に出る。026 §12 2026-10-16）。
  ローカルの DB は `npx supabase db reset` で seed に戻す。「用意すること」3 の設定を戻してもらったことを §9 に書く

### 5.4 Dashboard の設定（live。019 §4.1・§4.4・§8.3-2）

画面の名前は変わりうる。Settings → Billing → **Subscriptions and emails**（サブスクリプションおよびメール）のあたり。

| 項目 | すること | 値 |
| --- | --- | --- |
| リトライ | 見るだけ（変えない） | Smart Retries の推奨（2 週間で 8 回）か。違っても今は直さず記録し、当夜 23:30 の切り替えのときに直す（今直すと v1 の `past_due` が「未払い」になる時期が変わる。026 §6.3 23:30） |
| **リトライが尽きたら** | **変えない** | 「未払いにする」のまま。今「解約する」にすると `unpaid` の 134 件が解約され、救う 47 件を失う（019 §9.4 の前提）。切り替えは当夜 23:30（026 §6.3） |
| 確定の猶予 | 見るだけ | 既定（1 時間） |
| 顧客へのメール | 見るだけ | 支払い成功の領収書・支払い失敗（カード更新のリンク付き）・3D セキュアの認証のリンク・カードの有効期限切れの予告がオン |
| 解約の確認メール | 確かめるだけ | 設定画面に標準のオン・オフは無い。売上回収 → オートメーションに「サブスクリプションがキャンセルされた」から送るものが無いこと（§3-4） |
| 確認が必要な決済（3D セキュア）の送信メールとステータス | 見るだけ（変えない） | 今の値を記録する。当夜 23:30 にメールをオン・15 日でキャンセルへ（§3-9） |
| 請求書のフッター | 無ければ入れる | 「表示の金額は税込です」（019 §4.4。v1 の請求書にも載るが、v1 も税込なので問題ない） |
| 公開の事業者名 | 見るだけ | 入っている（ポータルと Checkout に出る） |
| 顧客へのメールの「決済手段の更新」 | 見るだけ（変えない） | 今の値を記録する。当夜 23:30 に「Stripe 上のページにリンク」へ変える（§3-8） |

変える前の値（リトライの回数・3D セキュアのメールとステータス・フッター・ポータル）を記録する（§9。戻すときに使う）。

### 5.5 Webhook を登録する（Workbench → Webhooks → Create an event destination）

1. **Your account** → payload の形式は **Snapshot**（既定の Thin にしない。ルートは `event.data.object.customer` を読む）→ API の版 **`2026-09-30.endive`**
2. イベント（ルートの `HANDLED` と同じ 7 種類だけ）:
   `checkout.session.completed` / `customer.subscription.created` / `customer.subscription.updated` / `customer.subscription.deleted` /
   `invoice.paid` / `invoice.payment_failed` / `invoice.payment_action_required`
3. 送信先は Webhook endpoint、URL は **`https://v2.assift.com/api/stripe/webhook`**（026 §3-11。当夜に `assift.com` へ変える。署名の secret は変わらない）。説明に「assift v2」
4. 設定の画面で signing secret（`whsec_…`）を Reveal してパスワードマネージャに入れる。エンドポイントの id（`we_…`）も控える（§6.2・当夜の操作で使う）
5. 有効のまま残す。**§5.6 と続けて行う**（Vercel に secret が無いあいだに届いた配信は 503 で失敗する。失敗が日をまたいで続くと Stripe が通知し、エンドポイントを止めることがある（未確認）。
   間を空けるなら登録の直後に Disabled にし、§5.6 の後に有効に戻してから §6.2 をする）

**カットオーバーまでに届くイベント**: v1 の利用者の Customer のもの。本番の DB には管理用アカウントしか無いので、`syncCustomer()` は持ち主を引けず何もせずに 204 を返す
（`findOwner()` が null。Stripe には書かない）。当夜は 22:00 に無効にし、判断点 B の直後に戻す（026 §3-12）。

### 5.6 Vercel の Production の環境変数（Settings → Environment Variables）

| 名前 | 値 | 環境 |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | アプリ用の鍵（`rk_live_…`） | **Production だけ**。Sensitive |
| `STRIPE_WEBHOOK_SECRET` | §5.5-4 の `whsec_…` | Production だけ。Sensitive |
| `CRON_SECRET` | `openssl rand -hex 32` で作った値（パスワードマネージャにも入れる。§6.1 で使う） | Production だけ。Sensitive |

- **Preview と Development には入れない。** プレビューに live の鍵が入ると、ブランチ DB の利用者で live の Stripe を触る（申し込みで本物の請求が走る）
- 入れたら Deployments → 最新の Production → **Redeploy**（環境変数は新しいデプロイから効く。024 §4.7）。10/27 からの merge の停止（026 §5）とは関係しない（同じコミットのデプロイ）
- 入れた後、`v2.assift.com` は live で申し込みを受けられる状態になる。live での申し込みは試さない（§2）。試しのアカウントを作ったら、カットオーバーの前に消す（021 §9.3。v1 と重なるメールは移行を止める）

## 6. 確かめ方

### 6.1 cron（Redeploy の後。あなた）

```
curl -i https://v2.assift.com/api/cron/billing-usage
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://v2.assift.com/api/cron/billing-usage
```

- 1 つ目が **401**（鍵が無くても 401 なので、これだけでは確かめにならない）
- 2 つ目が **200** で、本文が `{"sync":{"synced":0,"failed":0},"usage":{"sent":0,"failed":0}}`。v1 の約 1,000 件の契約を一覧で読むので 1〜2 分かかりうる（`maxDuration` は 300 秒）。
  v1 の Customer は持ち主が引けないので `synced` は 0 で、Stripe には何も書かない（`syncAllSubscriptions()`）
- 違うとき: 鍵付きで **401** は Redeploy していないか `CRON_SECRET` の値が違う（`CRON_SECRET` が無いと鍵付きでも 401）/ **503** は `CRON_SECRET` はあるのに `STRIPE_SECRET_KEY` が Production に無い（入れ忘れ・環境の選び違い）/ **500** は Vercel の Runtime Logs（か Axiom）の `[billing] 定期実行の同期に失敗しました` を見る。
  「price が見つかりません」なら §5.2 が済んでいない、権限のエラーならアプリ用の鍵に足す（Edit key。Redeploy は要らない）

### 6.2 Webhook（あなた）

1. Workbench → Events で、15 日以内の処理する種類のイベント（`customer.subscription.updated` か `invoice.paid` など）を開き、**Resend** で送信先に **§5.5 のエンドポイントだけ**を選んで送る
   （v1 は Webhook を持たない（019 §2.1）ので、ほかの送信先は無いはず）。
   無ければ CLI で `stripe events resend <evt_…> --webhook-endpoint=<we_…> --live`（30 日以内）。CLI は `stripe login` の live の鍵か `--api-key` を使う。
   アプリ用・移行用の鍵には Events の権限が無いので使えない
2. Webhooks → エンドポイント → Event deliveries で、その配信が **204**（v1 の Customer なので何もせずに返す）
3. 違うとき: **400** は署名の secret が違う（`STRIPE_WEBHOOK_SECRET` を入れ直して Redeploy）/ **503** は Redeploy していない /
   **500** は Runtime Logs の `[billing] Webhook の同期に失敗しました` を見る（権限なら鍵に足す）。処理しない種類のイベントでも署名の検証は先に通る（204）ので、
   secret と Redeploy の確かめにはなるが、鍵の権限（`customers.retrieve`）の確かめにならない。処理する種類を選ぶ

### 6.3 その夜の cron（あなた。Claude はクエリの文面と記録。10/22 の夜〜10/23 の朝）

- 見るのはあなた（Vercel・Axiom の画面。このクラウドのセッションには道具が無い）。Claude は ③ のクエリの文面を用意し、結果を 033・本プラン §9・リリース計画（ops-02）に記録する
- Vercel → Settings → Cron Jobs の履歴か Axiom で、23:20・23:50 の実行が 200
- Axiom に `[billing] 定期実行`（info）が **23:20・23:50 の時刻に 1 行ずつ**届く（§6.1 の手動の curl も同じ行を出すので、その日の行の数ではなく時刻で見る）→ 033 §3.2 の監視 ③ をクエリの形を直して有効にする
- ③ は「25 時間で 2 回未満」で鳴る。カットオーバーでは Cron Jobs を 10/30 の昼に止め、10/31 の昼に戻す（026 §3-5）ので、そのままだと 10/31 の 0:20 ごろから 10/31 の 23:50 まで鳴り続ける。
  **10/30 の昼に Cron Jobs と一緒に ③ を止め、11/1 の朝に 10/31 の 2 回の成功を見てから戻す**（026 §5・§6.6・手順書に足した）

## 7. 気を付けること

- **live の鍵の値は 1 回しか表示されない。** 保管し損ねたら、その鍵は Expire して作り直す（Rotate でもよい）
- **リトライの設定（未払いにする）を変えない**（§5.4）。設定の画面を開いたときに誤って保存しない
- カットオーバーまでの 9 日間、毎晩 2 回の cron が live の v1 の契約を読む（書かない）。10/30 の昼に Cron Jobs を止める（026 §3-5）
- 移行用の鍵は全員の契約を書き換えられる。手元で使うときもコマンドの行で渡し、シェルの履歴に残したくなければ先頭に空白を付ける（zsh の `HIST_IGNORE_SPACE` が有効なとき）
- `CRON_SECRET` は外から cron を叩ける値。人数の送信は冪等（identifier が同じ）なので、漏れても請求は変わらないが、漏れたら入れ替える

## 8. 文書と計画への反映

| いつ | どこ | 何を |
| --- | --- | --- |
| プランと一緒に（本 PR） | 026 §2・§4-2・§7.2・§11-3・§6.3 23:25・§5 10/29 | 担当のタスクを 035 に / 23:25 の鍵を `'<移行用の鍵>'` に / 10/29 の確認に「解約の確認メールのオートメーションが無いまま」（§3-4。当初は「解約メールがオフのまま」） |
| 同上 | 019 §8.3・024 §4.7・§10 | Stripe の live は 035 で行う旨の参照 |
| 同上 | 026 §4-2・§5 10/30 昼・§6.3 23:30・§6.4・§6.5-7・§6.6 11/1 朝 | 確かめ方を 035 §6 に / 監視 ③ を止める・戻す（中止・延期のときも）/ リトライが推奨と違えば 23:30 に直す / 23:05 以降の配信が 204 |
| 同上 | カットオーバー手順書（23:25 の鍵・10/29 の確認・監視 ③・23:30 のリトライ・23:56 の配信）/ リリース計画（このタスクのメモ・§5.3 の Claude のタスクを足す・cutover-14 のメモから dry-run を外す） | §3-2・§3-4・§3-6 |
| §5.3 の後 | `.env.example`・019 §4.1 | 確かめた権限の一覧に直す |
| 済んだら | 本プラン §9・019 §12・026 §12・024 §4.7 | 日時・`setup` の出力（id）・Dashboard の変える前の値・確かめの結果。秘密の値は書かない |
| 同上（§3-8・§3-9） | 026 §6.3 23:30・019 §8.3-4・手順書の 23:30 | 「決済手段の更新」を「Stripe 上のページにリンク」へ / 3D セキュアのメールをオン・確認待ちを 15 日でキャンセル |
| 済んだら | リリース計画の「リリース後」 | 移行用の鍵を失効させる（11/1 の請求の突き合わせの後） |

## 10. v1 のカード更新の URL を転送する（§3-8。別の PR）

- `next.config.ts` の `redirects()` に `{ source: '/card/:path*', destination: '/account/billing', permanent: false }` を足す（`/card` 自身も当たる。`/releases` と同じ形）
- 一時的（307）にする: ブラウザに記憶させない（`/card` を v2 で使うことになっても残らない）。v1 のカードの画面は GET で開くので、本文を持ち直す心配は無い
- 未ログインなら proxy が `/login?next=/account/billing` へ送り、ログインの後に「プランとお支払い」（ポータルのボタン）に着く
- 確かめ: `curl -sI <ホスト>/card/edit` と `/card` が 307 で `location: /account/billing`。プレビューと、merge の後の `v2.assift.com`
- 消してよい時期: 2027-10-30（`/serviceworker.js` と同じ。v1 のメールのリンクが残っていそうな期間）

## 9. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）

### 2026-10-21 プランのレビュー（1 回目。別の担当にコード・019・026・024・033 と突き合わせて読ませた。高 1・中 3・低 7、すべて反映）

- 高: §5.3 のとおりに流すと制限付きキーの確かめにならなかった（環境の `STRIPE_SECRET_KEY`（`sk_test_`）が `.env.local` より優先される・`verify/` は 1 つのクライアントで土台とアプリの経路を呼ぶ）
  → 鍵は起動の行で上書きし、土台とアプリの経路を別のプロセスに分け、鍵の request logs で確かめる
- 中: §6.1 の「503 は Redeploy していない」は誤り（`CRON_SECRET` が無いと先に 401）→ 401 と 503 の意味を直した
- 中: 監視 ③ を有効にすると、カットオーバーで cron を止めた夜から鳴り続ける → 10/30 の昼に止め、11/1 の朝に戻す（026 §5・§6.6・手順書）
- 中: 026 §4-2 の確かめ方が 035 と食い違っていた → 035 §6 に合わせた
- 低: 「アプリ用の鍵の権限は毎晩の cron で確かめられる」は言い過ぎ（一覧の読み取りだけ）→ 文言を直し、026 §6.5-7 に 23:05 以降の配信を足した /
  Webhook の登録から環境変数まで間が空くと配信が失敗し続ける → §5.5 を §5.6 と続けて行う / ポータルの上書きは既定の設定に効く → 前の値を控える /
  リトライを今直すと v1 に効く → 記録だけにして 23:30 に直す / Resend の送信先と CLI の鍵 / 節番号・呼び出し元・setup の出力の誤記

### 2026-10-21 プランのレビュー（2 回目。1 回目の反映の確かめと、全体を実物と突き合わせて。高 0・中 4・低 8、すべて反映）

- 中: §5.3 の全員の同期をテストクロック付きの契約で流すと、price で絞った一覧に出ず当夜と同じ経路を通らない → クロックの無い v1 相当の契約で通す（026 §7.3 と同じ。§5.3-10）
- 中: `unpaid` の救済にはサンドボックスの「再試行が尽きたら」を一時的に「未払いにする」へ変える必要があり、Claude は Dashboard を操作できない → あなたが用意することに足した（§5.3 の 3）。
  移行用の鍵の Invoices の権限は当夜の判断点 B の後に live で初めて使うので、救済は省かない
- 中: 割引の展開（Coupons Read）は phase 1 が始まった後にしか通らず、サンドボックスの鍵に最初から Read を付けるので要否を決めようがない → Read を必須と決め、§5.3-9 で Read で足りることだけ確かめる
- 中: Claude は Axiom・Vercel の画面を操作できない → §6.3 の担当をあなたにし、Claude はクエリの文面と記録
- 低: 切り替え待ちの解約は引き継ぎの後にしか流せない（§5.3-8 に移した）/ 鍵の渡し方を起動の仕方ごとに書き分けた（`stripe:*` は `.env.local` を読まない・`sync-all` は Supabase の 2 つも渡す）/
  イベントの取得は `sk_test` のプロセスで / Playwright は依存に無い / 026 §6.4 の中止・延期で監視 ③ を戻す手順が抜けていた / 10/23 の文言を cutover-25 にそろえた /
  ポータルのリンク先がポータルだった場合の判断を決めた（受け入れる）/ Axiom の行は数ではなく時刻で見る

### 2026-10-21 プランのレビュー（3 回目。2 回目の反映の確かめと全体の見直し。高 0・中 1・低 5、すべて反映）

- 中: §5.3 の切り替え待ちの解約と割引の展開が、書いたとおりには流せなかった（引き継ぎは Stripe にしか書かず DB に行ができない・結び付ける既存の道具 `v1.ts advance` は `sk_test` で同期し legacy-cancel を解約してしまう）
  → 結び付けを §5.3-8 として独立させ（新しい利用者・psql で写す・アプリ用の鍵の dev サーバーへ Webhook）、割引は legacy の契約で `lib.ts` の `advance()` だけを呼ぶ一時スクリプトで進める
- 低: 割引は `has_schedule` が false と Stripe 側の `discounts` で確かめる（schedule が残ると phase の割引から 50 になる）/ 「用意すること」3 の番号 /
  6・7・11 の道具（`v1.ts setup` と `unpaid-setup`・`--output` を分ける・クロックの無い契約は一時スクリプト）と片付け（クロックの無い Customer を消す）/
  退会の前提（ポータルで解約済み）と seed の利用者を使わないこと / Playwright の版（1.56.1）

### 2026-10-21 プランのレビュー（4 回目。収束の確認。高 0・中 1・低 3、すべて反映）

- §5.3 の手順 0〜11 は、書いた順に流せて、それぞれ書いた鍵と権限を通ることを確かめた（差し戻し無し）
- 中: live にポータルの既定の設定が無いと、setup は既定でない設定を毎回作り、v2 の `openPortal`（既定に頼る）がカットオーバーの後に失敗する
  → §5.2-0 で既定が無ければ Dashboard で 1 回保存してから流す、出力が「作成」なら止める、2 回目は同じ `bpc_…` で「更新」
- 低: Coupons の参照（§5.3-10）/ §6.3 の見出しの担当 / §5.3-2 の利用者の作り方

### 2026-10-21 プランのレビュー（5 回目。収束の確認。**高・中 0 件で収束**。低 3 件を反映）

- 4 回目の反映を確かめた。ポータルの既定の設定について「API で作った設定は既定にならない」「セッションは設定を指定しなければ既定を使う」は Stripe の資料で確認できた
  （「既定が無いとセッションの作成が失敗する」は資料に明記が無く未確認。手順は変えない）
- 低: §5.2-0 の文のつながり / 「作成」で止めたあとの流し直しと照合の基準 / 利用者の作成に `email_confirm: true`

### 2026-10-21 §5.1・§5.2 live の移行用の鍵と `stripe:setup`（あなたの Mac）

- §5.1: 移行用の鍵 `assift-v2-migration`（制限付きキー。用途は「構築した連携を強化」。AI エージェント用にすると二者承認ルールの対象になりうるので選ばない）を作り、パスワードマネージャに保管した
- §5.2-0: v1 の Product の ID は `assift`（setup は既存を使う）。**live にポータルの既定の設定が無かった**（`configurations.list({ is_default: true })` が空）。
  Settings → Billing → Customer portal で何も変えずに保存し、既定の設定 `bpc_1UT0NQEl6wKsSkziCo6hjmDP`（`is_default: true`・`active: true`）ができた。
  保存した直後の機能（setup が上書きする前の値。保存より前は既定が無く、v1 の利用者がポータルに入る経路は無かった）:
  顧客情報の更新はオン（名前・メール・住所・電話）/ 請求書の履歴・支払い方法の更新はオン / 解約はオン・期間の終わり・日割りなし・理由あり（`too_expensive` / `switched_service` / `unused` / `other`）/
  一時停止はオフ / プランの変更はオフ
- §5.2-1・2: 1 回目は Product が既存、Meter `mtr_61VcOS9pRQWZfoJSK41El6wKsSkziXge`・Price `price_1UT0UoEl6wKsSkziLOUlqcSY`・Coupon `assift_v1_legacy` を作成、
  Portal `bpc_1UT0NQEl6wKsSkziCo6hjmDP` を更新。2 回目は Meter・Price（`lookup_key: assift_monthly`）・Coupon が既存、Portal が同じ id で更新（冪等）。権限のエラーは無し
- つまずき: 最初は v1 の書き出しのフォルダ（`package.json` が無い）で、Node v16 のまま流して npm が止まった（Stripe には何も書いていない）。v2 のリポジトリで Node 22（`.nvmrc`）に切り替えて流し直した
- 残り（§5.2）: 顧客へのメールの「支払い方法を更新するリンク」の行き先と、ポータルのログインリンクの有無を控える / §5.2-4 の Dashboard での目視

### 2026-10-21 §5.2-0 顧客へのメールのリンクとポータルのログインリンク

- Settings → Billing の「決済手段の更新」は「両方を組み合わせて使用（レガシー）」: 無料トライアルのお知らせ `https://assift.com` / 有効期限が近付いているカード `https://assift.com` /
  カード支払いの失敗 `https://assift.com/card/edit` / 近日中の更新 `https://assift.com`。「顧客がサブスクリプションを管理するリンクを含める」はオフ
- ポータルの `login_page.enabled` は false（ログインリンクは無効）。メールのリンクもポータルを指さないので、v1 の利用者がポータルに入る経路は無い（setup の上書きは v1 に効かない）
- カットオーバーの後に `/card/edit` が 404 になることに気付き、§3-8・§10 を決めた（当夜 23:30 に Stripe 上のページへ・v2 に転送を足す）

### 2026-10-21 §5.2-4 live の中身の確かめ（Dashboard と API）

- Price `price_1UT0UoEl6wKsSkziLOUlqcSY`: 検索キー `assift_monthly`・従量課金・JPY・1 か月ごと・メーター「在籍スタッフ数（期間の最大）」・段階は 1〜10 が ¥0 / 残りが ¥100・`tax_behavior: inclusive`
- Meter `mtr_61VcOS9pRQWZfoJSK41El6wKsSkziXge`: `default_aggregation.formula: last`・`customer_mapping: by_id / stripe_customer_id`・`value_settings.event_payload_key: value`
- Coupon `assift_v1_legacy`: 名前「旧料金（v1 からのご継続）」・50%・無期限・有効
- ポータル `bpc_1UT0NQEl6wKsSkziCo6hjmDP`: 顧客情報の更新は名前だけ・解約はオン・期間の終わり・理由 5 つ（`too_expensive` / `unused` / `switched_service` / `missing_features` / `other`）
- §5.2 はこれで完了

### 2026-10-22 §5.4 live の Dashboard の今の値（変える前。まだ何も変えていない）

- Settings → Billing → サブスクリプションとメール通知:
  - 送信メール: トライアル終了 7 日前 オフ / 次回の更新 オフ / 有効期限が近いカード **オン** / カード決済が失敗した場合 **オン** / 口座振替 オフ
  - 決済手段の更新: 両方を組み合わせて使用（レガシー）（§9 2026-10-21 の値のまま。当夜 23:30 に変える。§3-8）
  - 確認が必要な決済（3D セキュア）: Radar のルールで 3D セキュアを求める オフ / **送信メール（Stripe が提供するリンクを送る）オフ** / サブスクリプションは 15 日で「未払いとしてマーク」/ 請求書は 15 日で「現状のまま」
  - 決済失敗を管理: カードの再試行は **Smart Retries・3 週間で最大 4 回**（推奨の 2 週間で 8 回と違う）/ 最新の請求が決済されたらアクティブ /
    最初の試行が失敗したら「期限超過のまま」/ **リトライがすべて失敗したら「未払いとしてマーク」**（当夜 23:30 まで触らない）/ 請求書はリトライがすべて失敗したら「期限超過のまま」
  - 顧客に送信された請求書: 確定した請求書を送信 オン / 未払いのお知らせ オフ / クレジットノート オン（カードで自動に請求する契約には効かない）
  - デフォルトの請求書モード: クラシック
- Settings → ビジネス → 送信メール: 決済成功時（領収書）**オン** / 返金時 オフ / デフォルトの言語 日本語 / 返信先 support@assift.com
- Settings → Billing → 請求書: デフォルトの項目価格「内税を含む」
- 公開の事業者名: 入っている
- 解約の確認メール: Stripe の設定画面には標準のオン・オフが無い（Billing のオートメーションで作るもの）。オートメーションの画面を探している

### 2026-10-22 §5.4 の続き（解約の確認メール・フッター）と §3-4 の改め・§3-9 の決定

- 売上回収 → オートメーション: 作られたオートメーションは無い（説明の画面だけ）。Stripe の設定画面に解約の確認メールの標準のオン・オフは無いので、**止めるものが無い**（§3-4 を改めた）
- 請求書のフッター（Settings → Billing → 請求書 → デフォルトのフッター）: 「表示の金額は税込です」が入っている（請求書と領収書の PDF に出る）
- §3-9: 3D セキュアの認証のリンクのメール（今はオフ）を当夜 23:30 にオン、確認待ちの決済を 15 日で「キャンセル」へ。026 §6.3 23:30・019 §8.3-4・手順書に足した
- §5.4 はこれで完了（変えたものは無い。当夜 23:30 に変えるものは §3-8・§3-9・リトライの回数（3 週間で 4 回 → 推奨の 2 週間で 8 回））

### 2026-10-22 §5.3 サンドボックスで鍵の権限を確かめる（Claude。クラウドのセッション）

- 環境: `STRIPE_SECRET_KEY` は `sk_test_`、`STRIPE_APP_TEST_KEY` / `STRIPE_MIGRATION_TEST_KEY` は `rk_test_`（値は表示していない）。どちらも制限付きであることを、権限の無い呼び出し（アプリ用の `GET /v1/invoices`・移行用の `GET /v1/checkout/sessions`）が 403 になることで確かめた
- 鍵は §5.3 のとおりに渡した: dev サーバーは `STRIPE_SECRET_KEY="$STRIPE_APP_TEST_KEY" npm run dev`、`stripe:*` は起動の行で移行用、土台（`verify/*`・イベントの取得・クロック）は `sk_test`

| # | 結果 |
| --- | --- |
| 1 | `stripe:setup`（移行用）2 回とも通った。Product・Meter・Price・Coupon は既存、Portal `bpc_1UO5QLIOMWCMZkC6zwTtSPJ2` は 2 回とも同じ id で「更新」 |
| 2 | 利用者 A（`auth.admin.createUser`・`email_confirm: true`）で確認画面 →「カード情報の入力へ」→ Checkout（4242）→ `/account/billing?checkout=success` で同期され「有料プラン」。`billing_subscriptions` は `active`・期間 10/22 〜 10/31 15:00 UTC、`profiles.trial_end` に開始時刻。ポータルを開いて解約 → Stripe の `cancel_at` が 11/1 0:00 JST |
| 3 | 署名なし・違う署名 → 400。A の `customer.subscription.updated` → 204 で `cancel_at` が写り `synced_at` が進んだ。`created` → 204、Meter に A のイベントの集計（値 0）ができた。イベントの取得は `sk_test` のプロセス |
| 4 | cron: `Authorization` なし → 401、Bearer → 200 `{ sync: { synced: 4, failed: 0 }, usage: { sent: 3, failed: 0 } }` |
| 5 | A の退会を画面から → `/` へ。Stripe の Subscription が `cancel_at_period_end: true`（`subscriptions.update` がアプリ用の鍵で通った）・利用者が消えた |
| 6 | `verify/v1.ts setup`（`sk_test`）で legacy / legacy-cancel / free を作った。あなたがサンドボックスの「リトライがすべて失敗したら」を「未払いとしてマーク」に変えてから `unpaid-setup` を流し、rescue と unpaid-old が `unpaid`（期限超過の 1 件 + 下書き 2 件）、unpaid-free は 0 円で `active` のまま |
| 7 | CSV-A を移行用で dry-run → `--apply --limit 1` → `--apply` → もう 1 回 `--apply`。legacy 2 件に schedule、free を解約、4 回目は「schedule 既存」と「対象外」だけ（冪等）。失敗 0。CSV-B も同じ順で: rescue は「下書き 1 件を無効 / 回収不能 2 件 / schedule 作成」で `active` に戻った（請求書は回収不能・無効・回収不能）、unpaid-old は「下書き 2 件を無効 / 回収不能 1 件 / 解約」、unpaid-free は解約。3・4 回目は「schedule 既存」と「対象外」だけ。**移行用の鍵で `invoices.list` / `update` / `finalizeInvoice` / `voidInvoice` / `markUncollectible` が通った**（当夜の判断点 B の後に live で初めて使う権限） |
| 8 | 利用者 B（legacy-cancel）・C（legacy）を作り、`stripe_customer_id` と `trial_end`（`2020-01-31T14:59:59Z`）を psql で写して Webhook を POST → 204、2 人とも `freemium-monthly`・`has_schedule = true`・`discount_percent = 50` の行ができた |
| 9 | B で「プランとお支払い」の「解約する」→「解約の手続きをしました」。schedule が `end_behavior: cancel`（phase 1 つ）、行の `cancel_at` が 10/31 14:59:59 UTC |
| 10 | C のクロックを `lib.ts` の `advance()` だけで 11/2 03:00 UTC まで進めた（`sk_test`）→ Stripe 側は `schedule: null`・`assift_monthly`・`discounts: [assift_v1_legacy]` → Webhook 204 で行が `has_schedule = false`・`discount_percent = 50`・期間 11/1 〜 11/30。Coupons は Read で足りる |
| 11 | クロックの無い v1 相当の契約（acacia・`freemium-monthly`・上限 15）を作り、移行用で `migrate-v1 --apply`（schedule 作成）→ 利用者 D に `stripe_customer_id` だけ写す → 移行用で `stripe:sync-all`: `接続先: Supabase 127.0.0.1:54321 / Stripe test`・`synced: 6, failed: 0`、D の行（`has_schedule = true`・50%）が一覧の経路でできた |

- 権限の過不足（引数の無い呼び出しで、何も作らずに確かめた。権限が無ければ 403、あれば 400 の引数のエラー）:
  - アプリ用: Products・Prices・Coupons・Billing Meters の作成は 403、Invoices の読み取りは 403（**Invoices は None で全部の経路が通った**。§4.1 の Invoices の行は外す）
  - アプリ用で `POST /v1/billing_portal/configurations` が 403 にならない（ポータルの Sessions と Configurations が同じ「Customer portal」の行なので、Sessions の Write で設定も書ける）。移行用も同じ理由で `POST /v1/billing_portal/sessions` が通る。分けられないので受け入れる
  - アプリ用で `GET /v1/products` が 200（鍵の画面の Products の行は「なし」だった。Products を付けなくても商品は読める。コードは Products を読まない）
- つまずき:
  - Checkout の国の既定がアメリカ合衆国で、郵便番号と（Link の保存がオンだと）電話番号が要る。国を日本にして Link の保存を外して通した
  - ポータルの解約は、理由のモーダルが先に出る（「キャンセルを続ける」→「サブスクリプションをキャンセル」）
  - 退会後に `/` を開くと、LP の Google Fonts（Zen Kaku Gothic New）が取れずにコンパイルが失敗し、dev サーバーのすべての応答が HTML の 500 になった（Webhook の 500 はこれ。コードの問題ではない）。dev サーバーを起動し直して通した
  - クロックの無い契約の usage record は、`timestamp` を作る前の時刻にすると断られる（`'now'` にした）。断られた 2 回分の Customer が残った（片付けで消す）
- 鍵ごとの View request logs: 2 本とも今日のリクエストが出ていた（あなたが確かめた）。制限付きキーで走っている
- 片付け: テストクロック 6 本（CSV-A・B）を消した（Customer と Subscription も一緒に消える）。クロックの無い Customer 4 件（2 の A・11 の契約と断られた 2 回分）を消した。
  ローカルの DB は `npx supabase db reset` で seed に戻した。サンドボックスの「リトライがすべて失敗したら」を「キャンセル」に戻してもらった
- サンドボックスには以前の確認の `assift_monthly` の契約が残っている（cron の `synced: 4` の内訳。今回作ったものではないので消していない）
- 反映: §4.1 の Invoices を None に、`.env.example`・019 §4.1 を確かめた権限の一覧に直した（§8）
- live のアプリ用の鍵（§5.1-2）は §4.1 のとおり（Invoices は None、Coupons は Read）。Products の行は「なし」（サンドボックスの `assift-v2-app-test` と同じ）

### 2026-10-23 §5.1-2・§5.5・§5.6・§6.1・§6.2・§10 の確かめ（あなた。記録は Claude）

- §5.1-2: live にアプリ用の鍵 `assift-v2-app` を作り、パスワードマネージャに保管した。権限はサンドボックスの `assift-v2-app-test` と同じ:
  読み取りと書き込みが Billing Meter Events・Checkout Sessions・Customer Portal・Customers・Subscriptions、読み取りのみが Coupons・Prices（Invoices・Products はなし）。
  **Subscription Schedules の行は Stripe の画面に無い**（検索しても出ない。Subscriptions に含まれる。§5.3-9 の切り替え待ちの解約は、この形の鍵で通っている）。移行用の鍵に足す権限は無かった
- §5.5: 送信先 `assift-v2`（お客様のアカウント・スナップショット・`2026-09-30.endive`・7 種類・`https://v2.assift.com/api/stripe/webhook`・説明「assift v2」）を登録し、有効のまま。
  signing secret と `we_…` を控えた。名前にホスト名を入れなかったのは、当夜に URL を `assift.com` へ変えるため
- §5.6: Vercel の Production だけに `STRIPE_SECRET_KEY`・`STRIPE_WEBHOOK_SECRET`・`CRON_SECRET`（Sensitive）を入れ、Redeploy した
- §6.1（10/23 09:45 JST ごろ）: 鍵なしは 401、鍵付きは 200 `{"sync":{"synced":0,"failed":0},"usage":{"sent":0,"failed":0}}`（約 50 秒。v1 の契約を全部読む）
- §6.2: Workbench のイベントの画面に Resend のボタンが見当たらなかった（送信先に一度も配信していないイベントだったため。配信済みのものは「送信先 → イベントの配信 → 再送する」から送れる）。
  Stripe CLI（v1.55.1。`stripe login` で本番のアカウント）で `stripe events resend evt_1UT1xiEl6wKsSkzihqMV96Z9 --webhook-endpoint=<we_…> --live` →
  `assift-v2` への配信が **204 OK**（API の版 `2026-09-30.endive`。v1 の `unpaid` の Customer なので持ち主が引けず何もしない）。終わったあと `stripe logout` した
- §10: `curl -sI https://v2.assift.com/card/edit` が 307・`location: /account/billing`（PR tabbyz/assift#64）
- §8: カットオーバー手順書の 22:00（送信先 `assift-v2` を無効に）・23:05（有効に）・23:43（「送信先を編集」で URL だけ変える）・23:56（失敗した配信の再送のやり方）を直した（Artifact の version 26）。
  019 §12・026 §12・024 §4.7 にも写した
- 残り: §6.3 その夜（10/23）の 23:20・23:50 の cron と Axiom の `[billing] 定期実行` → 033 の監視 ③ を有効にする（ops-02）

### 2026-10-24 §6.3 その夜の cron（あなたが Axiom で見た。記録は Claude）

- Axiom（`['vercel']`・production・lambda・`level == "info"`・`message contains "[billing] 定期実行"`）に 3 行: 10/23 09:46:01（§6.1 の手動）・**23:21:18**・**23:51:11**。
  どれも `{ sync: { synced: 0, failed: 0 }, usage: { sent: 0, failed: 0 } }`。Vercel の cron（23:20・23:50）は 1 分ほど遅れて走る
- 033 の監視 ③ の前提（成功したときに必ず 1 行出る）が本番で確かめられた。③ を有効にするのはあなた（033 §3.2 のクエリ・Threshold below 2・1 時間 / 25 時間・データ無しで通知オン・Notifier あり）
