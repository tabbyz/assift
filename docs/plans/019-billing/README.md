# 019: 課金（有料プラン）

- 前提: v1 分析 §4.6（プラン上限）/ 001（`profiles` の Stripe 列・移行。`plan_change_logs` の移行は本プランで取りやめる）/ 016（料金 `lib/billing/pricing`）/
  016-terms（第 8 条「料金」）/ 018-law（§6「課金の実装で守ること」）/ 017-privacy（Stripe から受け取る情報）
- 参照した v1 のコード: `app/models/{plan,user}.rb`、`app/controllers/{charges,cards,billing}_controller.rb`、`lib/tasks/stripe.rake`、
  `app/views/{charges,cards,billing}/*`、`app/views/shifts/_lock_panel`、`app/views/settings/staffs/_upper_limit`、`admin/graph_controller.rb`

> 番号: データ移行・カットオーバーより先に入れる。v1 には課金中の利用者がいるので、**カットオーバーの時点で課金が動いていないと請求が止まる**。
> 移行（001 §5）には本プランの §8 を足す。

**状態: プラン（未実装）。2026-10-07 に §11 の 1〜3・5〜14 を決定（同日に 2 を「リリース時に有料プランの人だけ」、1・3 を簡素化のため見直し、v1 の Stripe の実数で §8 を具体化）。4 はテストクロックの結果待ち。同日にプランのレビューを反映し、指摘が出なくなるまで見直した。2026-10-09 に有料プランの上限人数と、料金が上がる前の確認を足した（§13。同日に実装）。**

---

## 1. 目的と完了条件

### 目的

- 在籍スタッフが 10 人を超える店舗が、カードで有料プランに申し込める（11 人目から 1 人 100 円／月。016）
- 10 人を超える店舗も、**実際の人数で運用しながら試せる**（カード不要のトライアル。§7）
- 有料プランの請求は規約第 8 条どおり: **月末締め、その月の在籍スタッフ（全店舗の合計）の最大人数**。月の途中で解約しても日割りにしない
- **v2 のリリース時に v1 の有料プランを契約している利用者は、v1 の料金（11 人目から 1 人 50 円）をこれからも使える**（新料金の 50% 引きのクーポン。§2.4）
- v1 の Stripe サブスクリプションを、請求を止めず・二重にせず v2 に引き継ぐ

### 完了条件

- [ ] 無料プランで 11 人目の在籍スタッフを作れない（追加・復帰・初期設定のまとめて追加のどれでも）。**DB で止める**（§5.3）
- [ ] 11 人目で止まったときに、その場でトライアルを始められる。トライアル中は上限なし・請求なし
- [ ] 申し込みの前に、特商法 12 条の 6 の最終確認画面を出す（018 §6）
- [ ] Stripe Checkout でカードを登録すると有料プランになり、上限が外れる
- [ ] 月内の最大人数が Stripe に届き、翌月 1 日の請求書がその人数の料金になる（テストクロックで確認。§9.3）
- [ ] カードの変更・請求書の確認・解約を Stripe のカスタマーポータルでできる
- [ ] トライアルが終わる・解約する・支払いに失敗し続けると無料プランに戻り、10 人を超えていればシフト表がロックされる（v1 の lock panel）
- [ ] 退会すると有料プランが解約され、その月の分が請求される
- [ ] 旧料金の利用者（サブスクリプションに旧料金のクーポン）は 1 人 50 円で請求され、解約して申し込み直すと新料金になる
- [ ] 店舗の削除・スタッフの退職で人数の減少が履歴に残り、退会が失敗しない（§5.3）
- [ ] v1 で支払いが止まっている 47 件が有効に戻り、次の請求の失敗から通常の支払い失敗の流れ（メール・帯・リトライ・解約）に乗る（§8.2.2）
- [ ] v1 の課金中サブスクリプションの引き継ぎスクリプト（dry-run / apply）がテストモードで通る
- [ ] `lint` / `typecheck` / `test` / `npx supabase test db` が通る

---

## 2. v1 の課金と、v2 での落とし所

### 2.1 v1 の仕組み（コードから）

| 項目 | v1 |
| --- | --- |
| 料金 | 10 人まで無料。11 人目から **1 人 50 円**（`Plan::UNIT_PRICE = 50`）。上限は **5 人単位**で選ぶ（15 人 = 250 円、20 人 = 500 円…）。税込 |
| 何に課金するか | 利用者が選んだ**上限人数**（`users.max_staffs_count`）。実際の在籍数ではない |
| 上限 | `staffs_count >= max_staffs_count` で追加・復帰を止める（`maxed_out?`）。超えていればシフト表に lock panel（`over_limit?`） |
| Stripe | Product `assift` / Plan `freemium-monthly`（**旧 metered**、`aggregate_usage: max`、graduated tiers 0–10: 0 円 / 11–: 50 円）。API `2022-08-01` |
| 利用量の送信 | プラン変更時と、毎日の rake（`stripe:create_usage_record`）が `create_usage_record(action: set, quantity: 上限)` |
| 申し込み | 初回のプラン変更で Customer + Subscription を作る。カードは Elements + SetupIntent（3DS2 対応は 2025-03） |
| トライアル | 初回の申し込み（= カード登録）から **2 か月後の月末まで、人数無制限で無料**（`TRIAL_MONTH = 2`。Stripe の `trial_end`）。LP の「最初の 2 ヶ月はスタッフ何人でも無料でトライアル」 |
| 請求日 | トライアル終了（月末 23:59:59 JST）が anchor。画面の説明は「毎月 1 日に自動更新」 |
| 解約 | 画面なし。上限を 10 人に戻すと 0 円になる。退会時に Subscription を cancel |
| 履歴 | `usage_records`（上限の変更履歴）。`invoices` は未使用 |
| 個別契約 | Subscription なしで `max_staffs_count` だけ上げた利用者（振込の大口 1 社。018 §7） |
| Webhook | なし（支払い失敗を知る手段がない） |

### 2.2 v2 で決まっていること（016 / 016-terms / 018）

- 10 人まで無料、11 人目から 1 人 100 円／月（税込）。**数えるのは実際の在籍スタッフ**（上限を選ばせない）
- 月末締め、その月の最大人数。解約は月の途中でも日割りなし、翌月から無料。支払いはカードだけ
- 有料プランは**申し込んだときだけ**料金がかかる（規約第 8 条）

### 2.3 落とし所

| 論点 | v1 | v2 | 理由 |
| --- | --- | --- | --- |
| 課金の単位 | 上限人数（5 人単位で選ぶ） | **月内の最大在籍人数**（1 人単位。選ばせない） | 決定済み（016-terms）。人数を先に決める手間と「上限に当たって追加できない」が無くなる |
| 無料プランの上限 | `max_staffs_count`（既定 10） | **10 人で止める**。トライアル中・有料プランは上限なし | 「申し込んだときだけ料金」（規約）を守るには、無料のまま 11 人目を作れてはいけない |
| v1 の利用者の料金 | 1 人 50 円（5 人単位） | **リリース時に有料プランの人だけ** 1 人 50 円（1 人単位）を据え置く。**新料金の price に 50% 引きのクーポン（無期限）**を付けて実現する。無料プランの人は新料金（決定） | 同じ人数なら v1 より高くならない。料金表は 1 本のまま、旧料金はクーポンの有無だけで表せる（§2.4） |
| トライアル | カード登録から 2 か月後の月末まで（カード必須・人数無制限） | **カード不要・人数無制限**。11 人目で止まったときに始める。長さは全員 v1 と同じ**始めた日から 2 か月後の月末まで**（v1 で使った人は対象外）（決定。§7） | 10 人を超える店舗が実際の人数で運用を試せるようにする。カードを取らないので「試すだけのつもりが課金」が起きない |
| 申し込み | 自前の画面 + Elements | **最終確認画面（自前）→ Stripe Checkout** | カード番号・3DS・JCB 対応を Stripe に任せる。特商法の表示は Checkout の前の画面で行う（018 §6） |
| カード変更・請求書・解約 | カード変更だけ自前 | **カスタマーポータル** | 自前で持つ画面を減らす。従量課金のサブスクリプションはポータルで「変更」はできないが「解約」はできる（変更は不要） |
| 利用量の送信 | 毎日 rake で上限を送る | 月内の最大人数を **Billing Meter（集計 `last`）** に送る（§4） | 旧 metered（usage records）は API `2025-03-31.basil` で廃止。Meter に `max` は無い |
| 状態の把握 | Stripe に毎回問い合わせ | **Webhook + 同期関数**で DB にキャッシュ | 支払い失敗・解約を知るため。画面描画のたびに Stripe を呼ばない |
| 請求日 | anchor = トライアル終了 | **毎月 1 日 0:00 JST**（`billing_cycle_anchor_config`） | 「月末締め」と請求期間を一致させる（§4.3） |
| 上限を超えたとき | lock panel | **lock panel**（決定） | v1 と同じ。共有ページ・エクスポートは止めない |

### 2.4 旧料金（決定）

v1 の「プラン」のうち、v2 に残すのは料金（11 人目から 1 人 50 円）だけ。上限人数を選ぶ仕組みは v2 で無くなるので、旧料金の利用者にも適用しない。

**作り方: 料金表は新料金の 1 本だけにし、旧料金の利用者のサブスクリプションに 50% 引きのクーポンを付ける。** 新料金（1 人 100 円）の半額がちょうど v1 の 50 円になる。

- **対象: v2 のリリース（カットオーバー）の時点で、v1 の有料プランを契約している利用者だけ**
  - 有料プラン = 旧 `freemium-monthly` の Subscription が `active` / `trialing` / `past_due` で、**上限が 11 人以上**。
    v1 のトライアル中（上限を 11 人以上にして、まだ請求が始まっていない）と支払いのリトライ中も含める
  - **支払いが止まって `unpaid` になっているが、最近（90 日以内）も使っている人も含める**（決定。§11-10）。Stripe の支払い失敗と
    カード期限切れのメールは出ていたが、v1 は Stripe の状態を見ておらず、画面で知らせることも利用を止めることもしなかった（こちらの落ち度）ので救う。特別な対応はせず、旧料金に移したうえで**通常の支払い失敗の流れ**に乗せる（§8.2）
  - 振込の個別契約（Subscription が無く上限 11 人以上）は Stripe の外なので、クーポンではなく従来どおり手で請求する（§5.1 の `max_staffs_count`）
- **v1 の無料プランの利用者（上限 10 人。0 円の Subscription が残っている人を含む）は新料金**。v2 で登録した人と同じ扱い
- **クーポンは Subscription に付ける**（Customer には付けない）。Customer に付けると、解約して申し込み直した新しい Subscription にも引き継がれてしまう
- **期間は無期限**（`duration: forever`）。やめる時期は未定（リリースから半年ほどの見込み）。やめるときは告知してからクーポンを外す（§8.5）
- **解約で旧料金は終わる**（決定。§11-7）。クーポンは解約した Subscription と一緒に終わり、申し込み直した Subscription には付かないので、
  アプリで料金区分を戻す処理は要らない。解約予定（`cancel_at_period_end`）のうちに取り消せば同じ Subscription のままなので旧料金が続く
  - 旧料金の人には「プランとお支払い」の解約ボタン（ポータルへ）の手前に「解約すると旧料金（11 人目から 1 人 50 円）には戻れません」を出す。
    ポータルの中では出せないので、自前の画面で必ず通す。支払い失敗の注意にも同じ一文を添える
- 上限を選ぶ仕組みを外すのは**旧料金の利用者に不利ではない**（同じ人数なら同額以下）。ただし「上限で止まっていた追加が止まらなくなる」ので、
  カットオーバーの告知で知らせる（§8.4）
- v1 の無料プランの利用者は、11 人目以降を使うなら 1 人 50 円 → 100 円になる。契約中の料金ではないので、料金表の変更として告知するだけでよい（§8.4）
- v1 の上限を 10 人に戻していた（0 円の）Subscription は引き継がず、解約して無料プランにする（§8.2）

---

## 3. 調査（2026-10-07。docs.stripe.com は Markdown 版を取得して確認）

| 項目 | 内容 | 出典 |
| --- | --- | --- |
| 旧 usage records の廃止 | API `2025-03-31.basil` で削除。使い続けるには `2025-02-24.acacia` 以前を指定する。**移行の schedule の作成・更新も `2025-02-24.acacia` 以前で行う**（basil 以降は metered price に meter が必須のため） | [移行ガイド](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide) |
| Meter の集計 | `sum` / `count` / `last`。**`max` は非対応**（移行ガイドに明記）。`last` は期間内で最新のイベントの値。1 つの event name は 1 つの meter にしか使えない。作成後は表示名しか変えられない | [Meter の設定](https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure) |
| イベント | 時刻は過去 35 日〜未来 5 分。`identifier` の一意性は**少なくとも 24 時間**のローリング。処理は非同期（見込みの請求額にすぐ出ない）。同じ顧客・同じ meter への**同時呼び出しは 1 本まで**（超えると 429）。取り消しは 24 時間以内の adjustment | [利用量の送信](https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api) / [Meter Event API](https://docs.stripe.com/api/billing/meter-event/create) |
| 確定の猶予 | 既定 1 時間、最大 72 時間（ルールで「metered を含む・期間末の請求書」だけに設定できる）。猶予中の利用量が載るのは**期間末の請求書と schedule の切り替えの請求書だけ**（即時解約の請求書には載らない）。`invoice.created` に 2xx を返さないと確定が最大 72 時間待たれる | [猶予の設定](https://docs.stripe.com/billing/subscriptions/usage-based/configure-grace-period) / [Webhook](https://docs.stripe.com/billing/subscriptions/webhooks) |
| 即時解約 | `prorate` なしで即時解約すると**その期間の従量分は捨てられる**。`cancel_at_period_end` なら期間末に通常どおり請求 | [解約](https://docs.stripe.com/billing/subscriptions/cancel) |
| 請求日の固定 | `billing_cycle_anchor_config`（`day_of_month` / `hour` / `minute` / `second`。**UTC**）。`day_of_month: 31` は短い月は月末。Checkout でも使える。**`billing_cycle_anchor_config` とトライアルは併用不可** | [請求日](https://docs.stripe.com/billing/subscriptions/billing-cycle) / [Checkout の請求日](https://docs.stripe.com/payments/checkout/billing-cycle) |
| 初回の端数期間 | `proration_behavior: none` なら anchor までの期間は請求しない（「最初の請求書は免除」）。従量分の扱いは明記なし → テストクロックで確認 | 同上 |
| billing mode | API `2025-09-30.clover` 以降、新規は `flexible`。flexible は従量の 0 円明細を作らない（申し込み時に請求書が出ない）。v1 の Subscription は `classic` のまま | [billing mode](https://docs.stripe.com/billing/subscriptions/billing-mode) / [比較](https://docs.stripe.com/billing/subscriptions/billing-mode/compare) |
| カスタマーポータル | 従量課金は**解約できるが変更できない**。**schedule で変更が予定されている Subscription は解約もできない**。日本語あり（Customer の言語で自動） | [カスタマーポータル](https://docs.stripe.com/customer-management) |
| リトライが尽きたとき | Dashboard で「解約」「unpaid」「past_due のまま」「一時停止」から選ぶ | [Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries) |
| カード不要のトライアル（Stripe 側） | `trial_settings.end_behavior.missing_payment_method`（cancel / pause / create_invoice）で作れる。スパムで大量に作られる注意あり。カードを預かるトライアルはカードブランドの規則（終了前の通知など）に従う | [無料トライアル](https://docs.stripe.com/billing/subscriptions/trials/free-trials) |
| 最新の API | `2026-06-24.dahlia`（stripe-node 22.3.0） | [stripe-node のリリース](https://newreleases.io/project/npm/stripe/release/22.3.0) |
| 3D セキュア | 2025-03 末から EC 加盟店は EMV 3-D セキュアが原則義務。継続課金は初回（利用者の操作）で認証し、以降は加盟店起点（MIT）。発行会社が認証を求めたら Stripe がメールで認証リンクを送れる | [ネットショップ担当者フォーラム](https://netshop.impress.co.jp/node/12342) / [Adyen の解説](https://www.adyen.com/ja_JP/knowledge-hub/3ds-mandate-in-japan-what-you-need-to-know-2025) |
| Webhook の定石 | 生の body で署名を検証。イベントは**順不同・重複あり**なので、イベントの中身で状態を組み立てず、**Stripe から最新を取り直して DB に写す**同期関数を 1 本にする。決済後のリダイレクトだけに頼らない | [Next.js + Supabase + Stripe の整理](https://dev.to/gaper-ai/architecting-a-clean-nextjs-supabase-and-stripe-saas-stack-32eh) |
| トライアルの長さと型 | 長いほど転換率が上がるわけではない（14 日と 30 日で有意差なし、7 日のほうが良かった例も）。カード必須は転換率が高いが（約 60%）始める人が減り、カード不要は約 25% | [Tomasz Tunguz](https://tomtunguz.com/how-long-free-trial/) / [2026 年のベンチマーク](https://visionary-marketing.co.uk/blog/saas-free-trial-conversion-statistics-2026) |
| 特商法（2022 改正） | 最終確認画面の表示義務（12 条の 6）。解約を妨げるための不実告知の禁止（13 条の 2） | [ネットショップ担当者フォーラム](https://netshop.impress.co.jp/node/9499) |
| クーポン | `percent_off` は小計から割り引く。`duration` は `once` / `repeating` / `forever`。Subscription・schedule の phase・Checkout の `discounts` に付けられる | [クーポン](https://docs.stripe.com/billing/subscriptions/coupons) |

検討して採らなかったもの:

- **Supabase の Stripe Sync Engine**（Stripe の全オブジェクトを `stripe` スキーマへ写す）: 必要なのは 1 人 1 件のサブスクリプションの状態だけ。テーブルと権限が大きく増える
- **数量（licensed）の per-seat price**: 前払いになり、月の途中の増減で比例配分の請求書が出る。「月末締め・最大人数」と合わない
- **`invoice.created` で金額を invoice item として足す**: Stripe 側に料金表が無くなり、請求書の明細が「11 人目以降 N 人 × 100 円」にならない
- **旧料金を別の price（1 人 50 円）にする**（初版の案）: 利用者ごとの料金区分の列・解約で区分を戻す処理が要り、旧料金をやめるときに 2 回目の price の移行（schedule・ポータルで解約できない期間）が要る。クーポンなら外すだけ
- **期間末の請求書ができた瞬間（`invoice.created`）に最終値を送る**: 毎日の送信を期間の終わりの直前に寄せれば足りる。取りこぼすのは最後の 10 分の増員だけ（2026-10-08 の時点。当初は 1 時間）で、誤差として受け入れる（§4.2）
- **Stripe のトライアル（カード不要、`missing_payment_method: cancel`）**: トライアルを始めた人全員に Subscription ができ、`billing_cycle_anchor_config` と併用できない。
  アプリの中で持てば Stripe に何も作らずに済む（§7）

---

## 4. Stripe の構成

### 4.1 オブジェクト

| オブジェクト | 値 | 備考 |
| --- | --- | --- |
| Product | `assift`（v1 のものを使い回す） | live は既存。test は作る |
| Meter | `event_name: active_staffs`、`default_aggregation.formula: last`、`customer_mapping: { type: by_id, event_payload_key: stripe_customer_id }`、`value_settings.event_payload_key: value`、ingestion は既定（raw） | 作成後は変えられないので setup スクリプトで固定する |
| Price | `lookup_key: assift_monthly`、jpy、`recurring: { interval: month, usage_type: metered, meter }`、`billing_scheme: tiered`、`tiers_mode: graduated`、`[{ up_to: 10, unit_amount: 0 }, { up_to: inf, unit_amount: 100 }]` | 数字は `lib/billing/pricing` と一致させる（§6 のテスト） |
| Coupon | `id: assift_v1_legacy`、`percent_off: 50`、`duration: forever`、`name: 旧料金（v1 からのご継続）` | 旧料金の利用者の Subscription にだけ付ける（§2.4）。名前は請求書に出る |
| Portal 設定 | 請求書の履歴・支払い方法の更新・宛名（name）の編集・**期間の終わりに解約**・解約理由の収集（クーポンは出さない）。プランの変更はオフ | 言語は Customer の `preferred_locales: ['ja']` |
| Webhook | `/api/stripe/webhook`。本番と（あれば）ステージングだけ | preview は URL が PR ごとで Deployment Protection もある。§5.6 |
| Dashboard の設定 | 確定の猶予は既定（1 時間）のまま / リトライは Smart Retries の推奨設定（2 週間で 8 回）/ リトライが尽きたら**解約**（今は「未払いにする」。カットオーバーで切り替える。§8.3）/ メール: 領収書・**支払い失敗（カード更新のリンク付き）**・3DS の認証リンク・**カードの有効期限切れの予告** | v1 の時点で両方オン（2026-10-07 に確認）。それでも未払い 134 件が溜まったのは、v1 が Stripe の状態を見ず、アプリで知らせも止めもしなかったため（§8.2.1）。v2 は Webhook で状態を写し、アプリの帯とロックで対応する |

- price の id は環境変数に持たず **`lookup_key` で引く**（test / live で id が違っても同じコード）。クーポンは id を固定で作る
- これらは `scripts/stripe/setup.ts`（冪等。v1 の `stripe:create_product` / `create_plan` の置き換え）で作る。Webhook・Dashboard の設定は手で行い、手順を README に書く
- API キーは**制限付きキー**（Customers / Checkout Sessions / Subscriptions / Subscription Schedules / Invoices / Prices（読み取り。`resolvePriceId()` が lookup_key で引く）/ Billing Meter Events / Billing Portal の必要な権限だけ。`stripe:setup` と移行スクリプトは別の鍵で流す）
- SDK は `stripe`（node）を `apiVersion` 固定（実装時の最新。少なくとも `2026-06-24.dahlia`）

### 4.2 最大人数の数え方

Meter に `max` が無いので、**最大値はアプリが計算し、Meter には「その期間のここまでの最大値」を `last` で送る**。

1. 在籍スタッフ数が変わるたびに、DB のトリガが**履歴**（`staff_count_history`: 利用者・時刻・その時点の在籍数）を 1 行足す（§5.2）
2. 請求の対象になる区間 = `[max(期間の開始, トライアルの終了), 期間の終わり)`。その区間の最大人数 = `max(区間の開始時点の人数, 区間内の履歴の人数)`。
   区間が空（期間がまるごとトライアル中）なら 0。TS の純関数 `billableStaffPeak()`（`lib/billing/peak.ts`。Vitest）
3. 送るタイミング:
   - **毎日の cron（23:20 と 23:50 JST の 2 回。§12 の 2026-10-08 レビューで 1 回から変えた）**: 有料プランの全員について、今の期間のここまでの最大人数を `timestamp = min(今, 期間の終わり − 1 分)` で送る
     （v1 から引き継ぐ契約は期間の終わりが 23:59:59 JST なので、23 時台の終わりに走ったときに次の期間へはみ出さないようにする）。
     期間の最終日の送信がそのまま請求に効く（期間の終わり = 1 日 0:00 JST より前に届く）。
     最終日の送信より後（23:50 より後の 10 分）に増やした人数は、その期間の請求には載らない。誤差として受け入れ、設計の単純さを取る（決定。§11-8）。
     ただし次の期間は「開始時点の人数」に入るので、取りこぼすのは「その期間に 1 時間足らず在籍した人の、その期間 1 か月分」だけになる
   - 申し込み直後（同期のとき）と退会のとき（§5.8）に 1 回（時刻は同じく `min(今, 期間の終わり − 1 分)`）
4. `identifier = <subscription id>:<期間の開始>:<人数>`。同じ値の二重送信を Stripe が断る（`invalid_request_error`。送れたものとして扱う。一意性は 24 時間以上。`last` なので重複しても請求は変わらない）
5. 同じ顧客への同時送信は 1 本まで（429）。cron は利用者をまたいでは並行に、1 人の中では順に送り（§5.7）、429 は待って再試行する
6. 毎回、履歴から期間の始めからの最大人数を計算し直して送るので、cron が途中の 1 日落ちても翌日の送信で追いつく。期間の最終日に落ちたときだけ、
   最終日（と前日の送信の後）の増員が載らない（利用者に有利な側に倒れる）。翌日の cron は新しい期間に移っているので取り返せない。
   そこで最終日にも 2 回走るよう 1 日 2 回にし、同期が失敗しても送信は止めない（§5.7）

履歴方式にした理由: 期間を「JST の暦月」に決め打ちしないので、v1 から引き継ぐ Subscription（請求期間が月末 23:59:59 JST 始まり）でも、
トライアルが期間の途中で終わる場合でも、同じ関数で数えられる。在籍数の変化は 1 店舗で月に数回なので、行は増えない。

### 4.3 請求日

- 新しい Subscription は Checkout で `billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 }`（UTC）。
  **毎月末日 15:00 UTC = 翌月 1 日 0:00 JST** に期間が切り替わる（短い月は月末に寄る）。請求書は既定の猶予（1 時間）の後に確定してカードに請求する
- トライアルは Stripe に持たせないので（§7）、anchor と併用できない制約に当たらない
- 申し込んだ月の残り（申し込み〜月末）: 規約どおり「その月の最大人数」で請求する方針。`proration_behavior` の既定で初回の端数期間の従量分が
  1 日の請求書に載ることを**テストクロックで確かめた**（§9.3-1。2026-10-08、§12）。申し込みのときの 0 円の請求書は作られず、
  初回の請求書が「申し込み〜月末」の 1 枚になる（§11-4）
- v1 から引き継ぐ Subscription は請求日を動かさない（§8.2）

### 4.4 税とメール

- 価格は**税込**（018 §5。免税事業者）。Stripe の price に税率を付けず、Stripe Tax も使わない。請求書の下部（Dashboard の請求書設定）に
  「表示の金額は税込です」と入れる。**適格請求書は出さない**（登録番号が無い）。課税事業者になるときは Tax Rate と登録番号を足す（別マイルストーン）
- Stripe から送るメール（Dashboard）: 支払い成功の領収書 / 支払い失敗（カード更新のリンク付き）/ **3D セキュアの認証が必要な支払いのリンク** /
  カードの有効期限切れの予告。言語は Customer の `preferred_locales`（§5.5・§8.2）
- v1 の画面にあった「3D セキュア非対応のカードは使えません」の注記は出さない（Checkout とメールのリンクが認証を扱う）

---

## 5. アプリ側の設計

### 5.1 権利（entitlement）の規則

`lib/billing/entitlement.ts`（純関数）と SQL の `private.staff_limit(owner)` に**同じ規則**を書き、両方をテストで固定する。上から順に当てはめる。

> 2026-10-09: 有料プランの行は「なし」から「利用者が選んだ上限人数」に変える（§13.3）。

| 状態 | 在籍スタッフの上限 |
| --- | --- |
| サブスクリプションが `active` / `trialing` / `past_due` | なし（従量で請求） |
| トライアル中（`profiles.trial_end > now()`） | なし（請求なし） |
| `profiles.max_staffs_count` が 10 より大きい | その値（**個別契約**。v1 の振込の 1 社。管理者が SQL で設定） |
| それ以外 | `FREE_STAFF_LIMIT`（10） |

- `past_due`（支払い失敗のリトライ中）は使えるままにする。リトライが尽きたら **Subscription を解約**する設定にし（Dashboard）、
  `canceled` になった時点で無料プランへ落ちる。規約第 10 条（支払いの遅れで止める）の運用はこれで足りる
- `incomplete` / `incomplete_expired` / `unpaid` / `canceled` / `paused` は無料プラン扱い
- `trialing` は v1 から引き継ぐ Stripe のトライアル中の Subscription だけ（v2 のトライアルは Stripe に持たせない）

### 5.2 スキーマ（`supabase/schemas/`）

```sql
-- profiles: 列を足す / 意味を変える
-- trial_end: v1 では Stripe のトライアル終了。v2 では「アプリのトライアル終了」。null = 一度も使っていない（§7）
-- max_staffs_count: v1 の「上限人数」から「個別契約の上限（null = 通常）」に意味を変える（移行で値を入れ直す。§8.1）
-- stripe_subscription_id: billing_subscriptions に移し、列は消す

-- サブスクリプションの写し（1 人 1 件）。書くのは同期関数（service_role）だけ
create table public.billing_subscriptions (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  stripe_subscription_id text        not null unique,
  status                 text        not null,          -- Stripe の status をそのまま
  price_lookup_key       text,                          -- assift_monthly。lookup_key の無い v1 の price（freemium-monthly）は price の id
  discount_percent       smallint,                      -- 旧料金のクーポン（50）。null = なし（§2.4）。切り替え待ち（has_schedule）の間は schedule の phase 1 の割引を写す
  cancel_at              timestamptz,                   -- 解約予定（期間の終わり）
  current_period_start   timestamptz not null,          -- basil 以降は subscription item の値
  current_period_end     timestamptz not null,
  has_schedule           boolean     not null default false, -- v1 の引き継ぎ中（ポータルで解約できない。§8.2）
  synced_at              timestamptz not null default now()
);

-- 在籍数の履歴（§4.2）。書くのはトリガだけ
create table public.staff_count_history (
  id           bigint generated always as identity primary key,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  active_count integer     not null check (active_count >= 0),
  changed_at   timestamptz not null default now()
);
create index on public.staff_count_history (user_id, changed_at);
```

- RLS: 2 表とも `authenticated` は **SELECT のみ**（`user_id = (select auth.uid())`）。テナントの表ではないので `restrict_same_tenant` は無い（`profiles` と同じ型）。
  pgTAP に「他人の行が見えない / authenticated は書けない / anon は 42501」を足す
- `profiles` に `authenticated` の UPDATE は付けない（付けると `trial_end` や `stripe_customer_id` を書き換えられる）。AGENTS.md の「RPC は複数行を 1 文で書き換えるときだけ」の例外として、
  トライアルの開始は 1 行の更新でも RPC `start_trial()`（`security definer`、`trial_end is null` のときだけ、
  期間は始めた日から 2 か月後の月末まで。`auth.uid()` の行だけ）
  - `set search_path = ''`（関数の中は `public.profiles` のように完全修飾）。`auth.uid()` が null なら `raise`。引数は取らない（他人の行を指せない）
  - `execute` は `authenticated` だけ（`anon` は `unmanaged/restrict_anon_grants.sql` で外れる）
- 門番と履歴のトリガ関数（§5.3）は `private` に置き、`security definer` + `set search_path = ''`（`authenticated` は `staff_count_history` に書けないため）
- **`profiles.stripe_customer_id` は利用者が書ける口を作らない**（`grant update` も RPC も作らない）。書けると他人の Customer を指してポータルを開き、
  他人の請求書・カード情報を見られる。書くのはサーバーの `startCheckout()`（Stripe が返した Customer の id。service_role）と移行スクリプトだけ
- `plan_change_logs`（v1 の `usage_records`）は**移行せず、表ごと消す**（差分 migration で drop。型・pgTAP の `rls_tenant_isolation.sql` からも外す）。
  v2 には上限を選ぶ仕組みが無く使い道が無い。v1 の請求の記録は Stripe の請求書にあり、元のデータはカットオーバーで取る v1 のダンプに残る（§8.1）。
  001 §5.2・§7 の「`usage_records` は `plan_change_logs` として移行する」を上書きする（実装時に 001 にも注記する）
- 差分 migration は `declarative sync --name billing`。テーブルと関数を足すので `unmanaged/restrict_anon_grants.sql` を末尾に追記する

### 5.3 上限の門番（トリガ）

スタッフの追加は PostgREST の INSERT（`createStaff`）、復帰は UPDATE（`retired_at = null`）、初期設定は別の Action から入る。
Action ごとに確かめると抜けるので、**`staffs` の BEFORE INSERT / UPDATE OF retired_at トリガ**で止める。

- 在籍が 1 人増える変更のときだけ、店舗のオーナーの全店舗の在籍数を数え、`private.staff_limit(owner)` を超えるなら
  `raise exception using errcode = 'P0001', message = 'staff_limit_exceeded'`（画面の文言は Action 側で日本語に差し替える）
- 同時に 2 件足されて 11 人になるのを防ぐため、数える前に `profiles` のオーナー行を `for update` で取る
- 複数行の INSERT（初期設定でまとめて追加）でも行ごとに数える。PostgreSQL の行トリガは、同じ文で先に処理した行の変更を見るので、11 行目で止まる（pgTAP で固定する）
- `auth.uid()` が null（移行スクリプト・service_role）のときは止めない
- 同じトリガ関数の AFTER 版が `staff_count_history` に 1 行足す（前の行と同じ数なら足さない）
- **店舗の削除（cascade）**: スタッフの行が cascade で消えるときは店舗の行がもう無く、オーナーを引けない。そこで
  - `tenants` の **BEFORE DELETE** トリガで、その店舗の在籍スタッフを除いたオーナーの在籍数を履歴に記録する
  - `staffs` のトリガは、店舗やオーナーを引けなければ何もしない（cascade の途中）
  - これを怠ると減少が記録されず、履歴の最後の値が多いまま次の期間の「開始時点の人数」に使われ、**次に増減するまで多い人数で請求し続ける**
- **退会（利用者の削除の cascade）**: `profiles` の行が既に無いときは、`tenants` と `staffs` のどちらのトリガも記録しない
  （記録しようとすると外部キーの制約で失敗し、**退会そのものが失敗する**）
- 止めたときの表示: `createStaff` / 復帰 / 初期設定の Action が上の message を見て `{ ok: false, code: 'staff_limit' }` を返し、
  クライアントが**トライアルの案内**（まだ使っていなければ）または**申し込みの案内**のモーダルを開く（§5.4）

### 5.4 画面

URL は**利用者単位**（全店舗の合計で数えるので店舗の外）。`(protected)/account/billing/` に置く。

| 画面 | 中身 |
| --- | --- |
| 11 人目で止まったとき（モーダル） | トライアル未使用: 「10 人を超えるスタッフは有料プランで使えます。**◯月◯日まで無料で、人数の制限なく試せます**（カードの登録は要りません）」→「無料で試す」（`start_trial` → そのまま元の操作をやり直す）/「料金を見る」。使用済み: 「有料プランに申し込むと 11 人目から追加できます」→ 申し込みへ |
| `/account/billing`「プランとお支払い」 | 今のプラン（無料 / トライアル中（◯月◯日まで）/ 有料 / 有料（旧料金: 11 人目から 1 人 50 円。`discount_percent` で判定）/ 個別契約）、**いまの在籍数・今の請求期間の最大人数・今の請求期間の料金の見込み**（`monthlyPriceYen`。旧料金の契約は期間が月末 23:59:59 で区切られるので「今月」とは書かない。切り替え待ち（`has_schedule`）の間は、その期間が v1 で選んでいた上限人数で請求されるので見込みは出さず、「この期間は v1 で選んでいた上限人数で請求されます」と書く）、状態の注意（支払い失敗）、**解約予定なら「◯月◯日で終了予定」と「解約を取り消す」（ポータルで取り消せる。旧料金の人はここで取り消せば旧料金が続く。切り替え待ちの間に解約した人は、ポータルでは取り消せないので問い合わせを案内する。§5.5）**、ボタン「有料プランに申し込む」または「お支払い方法・請求書・解約」（ポータル）。旧料金の人はポータルへ進む前に「解約すると旧料金には戻れません」を出す |
| `/account/billing/subscribe`「お申し込み内容の確認」 | 特商法 12 条の 6 の最終確認（018 §6）: 料金（人数で変わること・料金表・いまの人数での見込み）、支払い時期（毎月末締め・翌月 1 日に請求）、提供時期（すぐ）、契約期間（1 か月ごと自動更新）、解約（いつでも。その月の末日まで使え、日割りなし）、返金なし、規約・特商法へのリンク。トライアル中なら「トライアルの終わる ◯月◯日までは請求しません」。ボタン「カード情報の入力へ」 |
| 支払い失敗の帯 | サブスクリプションが `past_due` の間、店舗の画面の上に「お支払いができませんでした。カードを更新してください。更新がないまま再試行が尽きると有料プランが終了します」+「カードを更新」（ポータル）。旧料金の人には「終了すると旧料金には戻れません」も添える。Stripe の支払い失敗のメールと二重に知らせる |
| トライアル中の帯 | 店舗の画面の上に「無料トライアル中: あと N 日（◯月◯日まで）。続けて使うには有料プランへ」+ 申し込みへのリンク。残り 7 日からは色を変える |
| アカウント画面 | 「プランとお支払い」へのリンク。退会の確認に「有料プランは解約され、今の請求期間の分を期間の終わりに請求します」を足す（§5.8） |
| スタッフの設定 | 無料プランで 10 人に達したら `Alert`（v1 の `_upper_limit`）「無料プランは在籍 10 人までです」+ トライアル / 申し込みへのリンク。追加ボタンは押せるまま（押したら上のモーダル） |
| 初期設定のスタッフ | 貼った名前が残りの枠を超えたら、保存の前に同じモーダル |
| シフト表 | **在籍が上限（§5.1。無料なら 10 人、個別契約ならその人数）を超えている**（トライアル終了・解約・支払い失敗の後）とき、v1 の lock panel と同じく表の上に重ねる: 「ご利用中のプランの上限（◯人）を超えています。有料プランに申し込むか、スタッフを退職にしてください」+ 2 つのボタン（個別契約の人には申し込みではなく問い合わせを案内する）。共有ページ・エクスポートは止めない（決定）。ロックは画面だけで、書き込みの Action は止めない（スタッフを増やす操作は §5.3 の門番が止める） |
| ヘッダー | 出さない（v1 の `_plan_status` は設定メニューにあったが、v2 は課金の画面に寄せる） |

- 文言の数字は `lib/billing/pricing` から引く（`monthlyPriceYen(count, discountPercent)`。割引は Stripe と同じく小計に掛けて 1 円未満を切り捨てる）。トライアルの日付は `lib/billing/trial.ts`
- Checkout から戻ったら `/account/billing?checkout=success` で同期（§5.6）してから描画し、通知「有料プランのお申し込みが完了しました」

### 5.5 Server Action（`account/billing/actions.ts`）

| Action | 内容 |
| --- | --- |
| `startTrial()` | `requireUser()` → RPC `start_trial()`。使用済みなら fail。`revalidatePath('/tenants', 'layout')` |
| `startCheckout()` | `requireUser()` → 同期して**既に有料なら fail**（二重契約を防ぐ）→ Customer が無ければ作る（`email`、`preferred_locales: ['ja']`、`metadata.assift_user_id`）→ `profiles.stripe_customer_id` を保存（service_role）→ Checkout Session（`mode: subscription`、`price` = `assift_monthly`、クーポンなし（`allow_promotion_codes` も付けない）、`payment_method_types: ['card']`、`locale: 'ja'`、`client_reference_id`、§4.3 の anchor、`success_url` / `cancel_url`、`expires_at` 30 分）→ `{ redirectTo: session.url }` |
| `openPortal()` | **DB の `profiles.stripe_customer_id`** でポータルの Session を作って `{ redirectTo }`（入力から Customer を受け取らない）。`has_schedule` の間はポータルで解約できないので、解約は下の Action で受ける（§8.2） |
| `cancelDuringMigration()` | `has_schedule` の間（v1 からの切り替え待ち）だけ「プランとお支払い」に出す解約ボタン。**schedule は release せず**、phase 1（新料金 + クーポン）を消して `end_behavior: cancel` に更新する（今の期間の終わりで終わる。旧 metered の明細を含むので API `2025-02-24.acacia` で呼ぶ）。問い合わせを経ずに解約できるようにする（決定。§11-11）。<br>release してから `cancel_at_period_end` にすると、ポータルで解約を取り消せてしまい、**旧 metered の price のまま schedule も無い契約**が残る（v1 の rake が止まった後は利用量が 0 になり、以後ずっと無料になる）。切り替え待ちの数日の間の解約の取り消しは問い合わせで受け、phase 1 を付け直す |

- 認証系と同じく `redirect()` せず `{ redirectTo }` を返し、クライアントが `window.location.assign`（外部 URL）
- それでも同じ Customer に有効な Subscription が 2 件できたら、同期関数が**新しいほう（誤って作られたほう）を即時解約**し、ログに出す
  （Meter は Customer 単位で集計するので、2 件あると二重請求になる）。古いほうを残すのは、旧料金のクーポンが付いた契約を失わないため
- Checkout から戻ったときの `session_id` は信用しない。同期は常に、ログイン中の利用者の `profiles.stripe_customer_id` で Stripe から取り直す

### 5.6 Webhook と同期（`src/app/api/stripe/webhook/route.ts`、`lib/billing/sync.ts`）

- `POST` だけ。`await request.text()` の生 body と `stripe-signature` で `constructEventAsync`。失敗は 400
- 受けるイベント: `checkout.session.completed` / `customer.subscription.{created,updated,deleted}` / `invoice.paid` / `invoice.payment_failed` /
  `invoice.payment_action_required`（3D セキュアの認証待ち。支払い失敗の帯を正しく出すため）
- どれも**中身を使わず** `syncCustomer(customerId)` を呼ぶだけ。同期関数は Stripe から Customer の Subscription を取り直し、
  `billing_subscriptions` を upsert / delete する（順不同・重複に強い。冪等）。クーポンの有無（`discount_percent`）もここで写す
- Customer → 利用者は `profiles.stripe_customer_id` で引く（無ければ `metadata.assift_user_id`）。**`metadata.user_id` は見ない**（v1 が作った Customer に v1 の数字の id が入っている）。
  利用者が居なければ（退会済み）何もしない
- **メールアドレスの変更**: アカウント画面でメールを変えたら（確定したら）、Stripe の Customer の `email` も書き換える。古いままだと領収書や支払い失敗のメールが古いアドレスに届く。
  同期関数でも `profiles.email` と Customer の `email` が違えば Customer 側を直す（確認メールを経た変更の取りこぼしの保険）
- 書き込みは `createPrivilegedClient()`。中のクエリはすべて `.eq('user_id', …)` / `.eq('id', …)` で 1 人に絞る（`publicShare.ts` と同じ規律）
- **preview には Webhook が届かない**（PR ごとの URL・Deployment Protection・PR ごとのブランチ DB）。Webhook に頼らず動くよう、
  `/account/billing` の描画時（`synced_at` が古いとき）と Checkout から戻ったときにも `syncCustomer` を呼ぶ。
  preview で確かめられないのは「解約・支払い失敗が自動で反映されること」だけ（ローカルは Stripe CLI の `stripe listen` で確かめる）

### 5.7 cron（`src/app/api/cron/billing-usage/route.ts`）

- `GET`。`Authorization: Bearer ${CRON_SECRET}` が無ければ 401。Vercel Cron で毎日 2 回、**23:20 と 23:50 JST**（`20 14 * * *` と `50 14 * * *`。`vercel.json`）。
  Vercel は Pro なので指定した分に走る。取りこぼすのは最後の 10 分の増員だけで、23:50 が落ちても 23:20 の値が残る
- 同期と送信は別々に受け、同期が例外で終わっても送信は続ける。どちらかが例外か、1 人でも失敗したら 500（Vercel の実行履歴で気付く）
- 対象は数百件（旧料金だけで 392 件）。1 人ずつ同期して送ると Stripe への呼び出しが 1 日 800 回前後になり、関数の実行時間の上限に掛かりうるので、
  - **同期は一覧でまとめて取る**: `subscriptions.list`（`assift_monthly` と旧 `freemium-monthly` の price で絞り、100 件ずつのページ）で状態と期間を取り、`billing_subscriptions` に写す（Webhook が落ちていた日の保険）。
    既定の一覧には解約済みが出ないので、**`billing_subscriptions` で有効扱いなのに一覧に出てこない行は個別に取り直す**（解約の Webhook を落とすと、上限なしのまま残ってしまうため）
  - **送信は利用者をまたいで並行**（並行数 10 程度）。同じ利用者への同時送信は 1 本まで（§4.2）なので、1 人の中は順に送る。429 は待って再試行する
  - ルートに `maxDuration` を指定する。件数が増えて収まらなくなったら、ページごとに分けて続きから実行できる形にする
- 1 人ずつ try/catch してログに出し、全体は止めない
- **見張り**: 旧 `freemium-monthly` の price のまま schedule が付いていない有効な契約を見つけたらログに出す（起きないはずの状態。利用量が送られず無料になってしまう）

### 5.8 退会

即時解約は従量分が捨てられ、猶予中の送信も載らない（§3）。そこで退会では**期間末の解約**にする。

**有料プランを解約していなければ退会できない**（2026-10-08 に変更）。アカウント情報の削除のセクションで「先にプランとお支払いから解約してください」と案内し、
ボタンを押せなくする。`deleteAccount` も Stripe から取り直した状態で断る（`blocksAccountDeletion`。Webhook が遅れていても通さない）。
解約済みで期間の終わりを待っている契約は、終わりを待たずに退会できる（以下の 1〜3 で今の期間の分を請求する）。

1. 有料プランなら、今の期間の最大人数を `timestamp = min(今, 期間の終わり − 1 分)` で送る（以降は履歴が消えるので、これがその期間の最後の値になる）
2. `cancel_at_period_end: true`。schedule が付いていれば release せず、`cancelDuringMigration()` と同じく schedule を `end_behavior: cancel` にする
3. `auth.admin.deleteUser`

期間末に Stripe が通常の請求書（1 で送った人数）を出して Subscription が終わる。Customer は消さない（請求書を残す）。
Stripe が失敗したら退会も止める（請求できないまま消さない）。退会の確認ダイアログに「今の請求期間の分（◯人・◯円の見込み）は◯月◯日に請求します」と出す。

### 5.9 AGENTS.md に足すこと

- `createPrivilegedClient()` の用途に「Stripe の Webhook / cron / 申し込みで `profiles.stripe_customer_id`・`profiles.trial_end`（申し込みでトライアルを使ったとみなすとき。§7.1）・`billing_subscriptions` を書くとき」（`lib/billing/` に閉じる）
- 旧 metered の明細を含む Subscription を触る呼び出し（移行スクリプト・`cancelDuringMigration()`・退会時の schedule の更新）だけ API `2025-02-24.acacia` を指定する、という例外
- `src/app/api/` は「ファイルを返す GET だけ」→ Webhook（POST）と cron（GET）を足し、それぞれの認証（署名 / `CRON_SECRET`）を書く
- proxy の `config.matcher` から `/api/stripe` と `/api/cron` を外す（ログイン状態と無関係で、Supabase のセッション更新は要らない。
  prefetch を外さない決まりは、セッション cookie を書くページのためのもので、これらには当たらない）
- ディレクトリ表の `billing/`: pricing に peak / entitlement / trial / sync / stripe（クライアント）を足す
- RPC の一覧に `start_trial`

---

## 6. ファイル

```
scripts/stripe/setup.ts                      Product / Meter / Price / Coupon / Portal 設定（冪等）
scripts/stripe/migrate-v1-subscriptions.ts   v1 の Subscription の引き継ぎ（dry-run / apply。§8.2）
src/lib/billing/
  pricing.ts (+test)        割引率（旧料金のクーポン）を受ける引数を足す
  entitlement.ts (+test)    §5.1 の規則
  trial.ts (+test)          トライアルの終了日（始めた日から 2 か月後の月末。JST）
  peak.ts (+test)           履歴とトライアルから、請求の対象になる区間の最大人数
  stripe.ts                 server-only。SDK の生成（apiVersion 固定）と lookup_key の解決
  checkout.ts (+test)       Checkout Session の引数を組む純関数（anchor / price）
  sync.ts                   syncCustomer()。service_role
  usage.ts                  Meter への送信（identifier を組む部分は純関数で test）
src/lib/queries/billing.ts  画面用の読み取り（RLS）
src/app/(protected)/account/billing/{page.tsx, subscribe/page.tsx, actions.ts, _components/*}
src/components/billing/     上限のモーダル・トライアルの帯・lock panel（店舗の画面とスタッフ設定・初期設定で共有）
src/app/api/stripe/webhook/route.ts
src/app/api/cron/billing-usage/route.ts
supabase/schemas/public/tables/{billing_subscriptions,staff_count_history}.sql、profiles.sql、private/functions.sql、public/functions.sql（start_trial）
supabase/tests/billing.sql  門番・履歴・トライアル・RLS
vercel.json                 crons
```

環境変数（`.env.example`）: `STRIPE_SECRET_KEY`（制限付きキー）/ `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET`。
hosted Checkout なので publishable key は要らない。未設定なら申し込みは「現在利用できません」にし、ほかの機能（10 人までの利用・トライアル）は動かす。

テスト:

- Vitest: `entitlement`（状態 × トライアル × 個別契約）、`trial`（月末・年またぎ・閏年）、`peak`（区間の前の行・区間内の増減・行なし・
  トライアルが期間の途中で終わる・期間がまるごとトライアル）、`pricing`（Stripe の tiers と同じ表。50% 引きで v1 の料金と一致する）、`checkout`（anchor の値）、
  `usage`（identifier）
- pgTAP: 無料で 11 人目の INSERT / 復帰が P0001、15 行をまとめて INSERT すると P0001（1 行も入らない）、トライアル中・有料・個別契約なら通る、他人の店舗のスタッフ数は数えない、service_role は止めない、
  履歴が増減で 1 行ずつ増え、同じ数では増えない、**店舗を消すと減った人数が 1 行記録される**、**退会（`auth.users` の削除）が通り、履歴も消える**、`start_trial` は 1 回だけ・他人の行は変えない・anon は 42501、2 表の RLS

---

## 7. トライアル（決定）

### 7.1 方針

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| カード | **不要** | 「試すだけのつもりが課金されていた」を構造的に起こさない（苦情・チャージバック・特商法の定期購入の論点が無い）。終了時に止まるのは**ロック**なので、カードが無くても決断の瞬間は来る |
| 人数 | **無制限** | 20 人の店舗が実際の人数で運用できないと、試したことにならない |
| 始まる時点 | **11 人目で止まったとき**（モーダルの「無料で試す」）。登録時ではない | 10 人以下の店舗は無料で足りるので、トライアルを無駄に消費しない。必要になった瞬間から数える |
| 長さ | **始めた日から 2 か月後の月末まで**（61〜92 日。v1 と同じ）。全員同じ。v1 で使った人（`trial_end` が埋まっている）は対象外 | v1 で約束していた長さを変えない（v1 の利用者に不利な変更にしない）。全員そろえれば、v1 から来た人かを見分ける列と分岐が要らない。シフト表は月単位なので、月末で終わればいつでも「次の月のシフトを作り終えたところで終わる」決断の瞬間になる（10/10 に始めると 12/31 まで。1 月のシフトを作り終えた直後） |
| 回数 | 1 アカウント 1 回（`trial_end is null` のときだけ始められる）。**トライアルを使わずに申し込んだ人も、申し込んだ時点で使ったものとみなす**（同期関数が Subscription を初めて写すとき、`trial_end` が null なら **Subscription の開始時刻**を入れる。Webhook が遅れても、請求の区間（§4.2）がずれないように今の時刻にはしない） | 「申し込む → 解約 → トライアルで 2 か月無料」の抜け道を塞ぐ |
| トライアル中に申し込む | できる。**トライアルの終わりまでは請求しない**（§4.2 の区間がトライアルの終わりから始まる）。2026-10-09: 申し込んだ時点から上限人数が効く（§13.3） | 「今のうちにカードを登録しておく」を損なく選べる。終了日にロックされる人を減らす |
| 終わったとき | 無料プランに戻る。10 人を超えていればロック（§5.4）。データは消さない | |
| 知らせ | トライアル中は店舗の画面に残り日数の帯（§5.4）。メールは送らない（送るなら Supabase のメール基盤とは別に作る必要があるので後回し） | |

### 7.2 v1 からの変化

v1 は「カード登録から 2 か月後の月末まで、カード必須」だった。v2 は**カード不要・必要になった時点から**に変える。長さは v1 と同じ（2 か月後の月末まで）。
当初は新規を「翌月末まで」にする案だったが、v1 の利用者の長さを変えないと決めたので、分岐をなくすために全員を v1 の長さにそろえた（§7.3 のとおり、長さの差の影響は小さい）。

### 7.3 「長いトライアルで運用に乗せて解約しづらくする」についての意見

- **10 人を超える店舗に試す手段が要る、はその通り。** 最初の案（トライアルなし）は 10 人以下の店舗しか見ておらず、20 人の店舗は無料の範囲では試せない。撤回する
- **長さは、決め手にならない。** ベンチマークでは 14 日と 30 日で転換率に差が無く、長いほど上がるわけでもない（§3）。効くのは「実際の業務に乗ること」で、
  シフト表なら**作る → 運用する → 次を作る**の 1 周（約 1 か月半）があれば乗る。3 か月は、乗った後の 1 か月半を無料で渡しているだけになりやすい。
  一方で 20 人の店舗で 1 か月 1,000 円なので、長くしても失う額は小さい。**どちらでも大きな差は出ない**。大事なのは月末で区切って
  「次の月のシフトを作り終えた直後」に終わることで、これは翌月末でも 2 か月後の月末でも成り立つ（最終的に 2 か月後の月末にそろえた）
- **「解約しづらくする」は、手間ではなくデータで作る。** シフト表・スタッフの条件・共有リンクを店がスタッフと使い始めた時点で、乗り換えの費用は十分に高い。
  解約の導線を隠す・引き止める方向は、小さな店の口コミで逆に効き、解約を妨げる不実告知は特商法 13 条の 2 に触れうる。ポータルの解約はそのまま出す
- **カード必須にするかが、長さよりずっと大きな分かれ目。** カード必須は転換率が高い（約 60% 対 25%）が、始める人が減り、「知らない間に課金」の苦情が出る。
  assift は「止まったら申し込む」ロックが強い決断の瞬間になるので、カード不要でも転換を取りこぼしにくい。最初はカード不要で始め、
  転換率を見て変える（トライアルを始めた数・申し込んだ数は `profiles.trial_end` と `billing_subscriptions` から数えられる）

---

## 8. v1 からの引き継ぎ（データ移行・カットオーバーに足す）

### 8.1 データ（001 §5.2 の users 行を書き換える）

| v1 | v2 |
| --- | --- |
| リリース時に有料プランの利用者（§2.4） | DB には何も持たない（旧料金は Stripe のクーポンで表す。§8.2）。移行スクリプトが対象の一覧（利用者・Subscription・上限・状態）を CSV で出し、v1 のダンプと一緒に保管する |
| `stripe_customer_id` | そのまま（Customer は live の同じアカウント） |
| `trial_end` | そのまま（埋まっていればトライアル使用済み。未来ならその日までトライアル中として扱う） |
| `usage_records` | **移行しない**。カットオーバーで取る v1 のダンプ（暗号化し、保管期間を決めて残す。001 §5.4）に残る |
| `max_staffs_count` | **Subscription が無く、11 以上**のユーザー（個別契約）だけその値。ほかは null |
| `stripe_subscription_id` | 入れない。移行の後に全員を同期して `billing_subscriptions` を作る（一覧でまとめて取る。§5.7・§8.3） |
| 在籍スタッフ数 | 全員に `staff_count_history` を 1 行（移行時点の数）。インポートの間は `staffs` / `tenants` のトリガを止める（`session_replication_role = replica`。止めないとスタッフ 1 行ごとに履歴ができる）。門番は `auth.uid()` が null なら止めないので影響しない |

移行の検証に足す: 無料扱いなのに在籍が 10 人を超える利用者の数（v1 の `over_limit?`。v2 では lock panel が出る）。多ければカットオーバーの前に連絡する。

### 8.2 Stripe の Subscription（`scripts/stripe/migrate-v1-subscriptions.ts`）

#### 8.2.1 実数（2026-10-07。v1 の本番 Stripe と DB から）

Stripe のサブスクリプションは 有効 795 / 未払い 155 / 期日経過 7 / トライアル中 26。上限 11 人以上の利用者だけを、Stripe の状態と
最後にシフトを編集した時期で分けると次のとおり（v1 の `rails runner` で集計）。

| Stripe の状態（上限 11 人以上） | 件数 | 30 日以内 | 90 日以内 | それ以前 | 編集なし |
| --- | --- | --- | --- | --- | --- |
| `active` | 313 | 249 | 6 | 54 | 4 |
| `unpaid` | 134 | 43 | 4 | 79 | 8 |
| `past_due` | 6 | 4 | 0 | 2 | 0 |
| `trialing` | 26 | 25 | 1 | 0 | 0 |

- 上限 10 人（0 円）の Subscription は、有効が約 480 件（795 − 313）、未払いが約 21 件、期日経過が 1 件
- `unpaid` は、リトライが尽きたあと「未払いにする」設定で止まった Subscription。**毎月の請求書が下書きのまま溜まり、請求されていない**
  （9 月作成分で 1 円以上の下書きが 94 件以上）。v1 は Stripe の状態を一切見ない（上限の判定は `max_staffs_count` だけ。Webhook も無い）ので、この人たちは払わずに有料の人数で使い続けている。
  Stripe の支払い失敗・カード期限切れのメールはオンになっていた（2026-10-07 に確認）ので、メールだけでは更新されなかった人たちでもある
- 上限 11 人以上で 90 日以上シフトを編集していない `active` の 58 件は、払い続けている。対応はしないが、カットオーバーの告知で解約が出る前提で見込む

#### 8.2.2 扱い

| 区分 | 件数 | 扱い |
| --- | --- | --- |
| 上限 11 人以上・`active` / `past_due` / `trialing` | 345 | **旧料金に移す**: subscription schedule（`from_subscription`。既にあれば更新）で、**今の期間の終わり**に price を `assift_monthly` へ切り替え、同時に旧料金のクーポンを付ける。phase 0 は今の price・期間・`trial_end` をそのまま、phase 1 は `items: [{ price: assift_monthly }]`・`discounts: [{ coupon: assift_v1_legacy }]`（acacia で `discounts` が通らなければ旧来の `coupon: assift_v1_legacy`）、`end_behavior: release`。今の期間は v1 が送った上限（usage records の max）で請求される |
| 上限 11 人以上・`unpaid`・90 日以内に編集あり | 47 | **有効に戻してから、上と同じく旧料金に移す**（決定。§11-10）: 溜まった下書きを**最新の 1 件を除いて**無効にし、最新の下書きは確定して、失敗した請求書と一緒に「回収不能」にする（Stripe は最新の請求書が支払い済み・回収不能になったときに `active` へ戻す。最新を無効にすると `unpaid` のまま。2026-10-08 に確認。過去分は請求しない。§11-12）。そのあと上の行と同じ schedule を付ける。**次の請求（今の期間の終わり）は期限切れのカードで失敗し、通常の支払い失敗の流れ**（Stripe の支払い失敗メール・リトライ・アプリの帯。§5.4）に乗る。カードを更新すれば旧料金のまま続き、更新しなければリトライが尽きた時点で解約（§8.3 で切り替える設定）→ 10 人を超えていればロック |
| 上限 11 人以上・`unpaid`・それ以外（編集なし・90 日より前） | 87 | 即時解約。溜まった下書きは無効にし、失敗した請求書は回収不能にする（開いたままだとポータルに未払いが残り、同じ Customer で申し込み直したときに払えてしまう。§11-13） |
| 上限 10 人（0 円）・すべての状態 | 約 502 | 即時解約（請求は 0 円）。利用者は新料金の無料プランになる。未払いの分の下書きも無効にする |

- 下書きの無効化: サブスクリプションの下書きは削除できず、無効にできるのは確定した請求書だけ。`auto_advance: false` にしてから確定し（請求は走らない）、
  すぐ無効にする。テストモードで、確定の時点でメールや請求が走らないことを確かめる
- 「回収不能」で `unpaid` から `active` に戻ることは、サンドボックスで確かめた（最新の請求書を回収不能にしたとき。§12 の 2026-10-08）
- **schedule の作成・更新は API `2025-02-24.acacia` を指定する**（basil 以降は meter の無い metered price を扱えない。移行ガイド）。
  stripe-node はリクエストごとに `apiVersion` を上書きできるので、このスクリプトと `cancelDuringMigration()` の該当の呼び出しだけ acacia にする
- v1 の Subscription は `classic` のまま。請求日もそのまま（月末 23:59:59 JST 前後。v1 から変えない）
- 旧料金に移す 392 件の Customer に `preferred_locales: ['ja']` を設定する（v1 は設定していないので、支払い失敗のメールやポータルが英語になりうる）
- schedule が付いている間（カットオーバーから最初の期間の終わりまで）は**ポータルで解約できない**。`billing_subscriptions.has_schedule` を立て、
  その間は「プランとお支払い」の解約ボタンを `cancelDuringMigration()` に向ける（§5.5）。切り替わった後は release されて通常に戻る
- 切り替えの請求書（phase の切り替え）にも猶予中の利用量が載る（§3）ので、新しい price の最初の期間からは §4.2 の送信がそのまま効く
- カットオーバーで v1 の rake（Heroku Scheduler の `stripe:create_usage_record`）を止める。切り替えまでの残りの期間は、v1 が最後に送った上限で請求される
  （上限を超えて v2 で足したスタッフは、その期間は請求されない。利用者に有利なので許容）

#### 8.2.3 スクリプトの流し方（決定。§11-11）

1. `--dry-run`: 区分ごとの一覧を CSV に出す（利用者・Customer・Subscription・状態・上限・期間の終わり・最後の編集・するはずの操作）。
   件数が §8.2.1 と合い、旧料金に移す 392 件（345 + 47）の今月の請求見込みの合計が v1 の管理画面の売上と大きく違わないことを確かめる
2. `--apply --limit 5`: 区分ごとに数件だけ適用し、Customer の言語が日本語になったこと、Dashboard で schedule の中身（次の期間から `assift_monthly` + クーポン）・無効にした下書き・`active` に戻ったことを目で確かめる
3. `--apply`: 残りを流す。冪等にする（schedule が既にあれば作らない、解約済みは飛ばす）。途中で止まっても再実行できる
4. 結果の CSV を v1 のダンプと一緒に保管する

### 8.3 順序

1. （事前）live で `scripts/stripe/setup.ts`、Webhook の登録、Dashboard の設定（§4.1。支払い失敗とカード期限切れのメールはオンになっている）
2. （事前）**Dashboard の「サブスクリプションの解約を顧客にメールで知らせる」をオフ**にする（0 円・放置の約 590 件の即時解約で、解約メールが一斉に送られないように）
3. **カットオーバーは月の下旬に置く**（決定。§11-11）。v1 の Subscription はほぼ全員が月末で期間が切り替わるので、schedule が付いている（ポータルで解約できない）期間が数日で済む
4. カットオーバー: v1 停止 → データ移行（§8.1）→ `migrate-v1-subscriptions`（§8.2.3）→ 全員の同期（cron と同じく一覧でまとめて取る。§5.7）→ v1 の rake を止める →
   **Dashboard の「リトライが尽きたら」を「未払いにする」から「解約する」に変える**（決定。§11-14）→ 解約メールの設定を戻す
5. 切り替え後の最初の請求日: 旧料金の利用者の請求書を Dashboard で突き合わせる（クーポンが効いて 1 人 50 円。v1 の上限での料金 ≥ v2 の請求になっているはず）。
   救った 47 件の支払い失敗の数と、カードを更新した数を見る

### 8.4 告知（カットオーバーの告知に含める。016-terms §5 の 548 条の 4 の周知と一緒に）

旧料金の利用者（有料プランを契約中の人）へ:

- 料金はそのまま（11 人目から 1 人 50 円）。請求書には「新料金（1 人 100 円）から旧料金の割引 50%」と出る。上限を 5 人単位で選ぶ仕組みは無くなり、**その月の在籍スタッフの最大人数**で請求する（同じ人数なら今より高くならない）
- 上限で止まることが無くなるので、人数を増やすとその月から料金が変わる（→ 2026-10-09 に差し替え。v1 の上限を引き継ぐ。§13.7）
- 請求書・カードの変更・解約は「プランとお支払い」から（Stripe の画面。切り替えの直後の数日はアプリの画面から）
- 解約すると旧料金は終わり、再び申し込むと新料金（11 人目から 1 人 100 円）になる。支払いの失敗が続いて解約になった場合も同じ

無料プランの人へ:

- 10 人までは引き続き無料
- 11 人目からの料金が 1 人 100 円になる（これまでは 5 人ごとに 250 円）
- トライアル（v1 でまだ使っていない人）はこれまでどおり 2 か月後の月末まで。カードの登録は不要になり、11 人目を追加するときに始められる

### 8.5 旧料金をやめるとき（リリースから半年ほどの見込み。時期は未定）

- 告知する（規約第 8 条: 不利な変更は新しい料金になる月が始まる前に）。その月が始まる前に解約すれば新料金はかからない
- 新料金にする月の**期間が始まった直後**に、クーポンの付いた Subscription から割引を外す（`discounts` を空にする）。
  割引は請求書の確定時に効くので、期間の途中で外すとその期間まるごとが新料金になる。外す時期で「◯月分から新料金」が決まる
- 1 件につき API を 1 回呼ぶだけなので、件数が少なければ Dashboard で手で外してもよい。クーポン自体は消さずに残す（過去の請求書が参照する）

---

## 9. 実装の順序と確認

### 9.1 順序

1. Stripe のテストモードで §9.3 の 1〜3 を手で確かめる（anchor・初回の請求・`last`）。結果で §4.3 / §11-4 を確定する
2. スキーマ（§5.2・§5.3）+ pgTAP
3. `lib/billing/*` の純関数 + Vitest
4. 同期・Webhook・cron
5. 画面（上限のモーダル・トライアル・プランとお支払い・確認画面・lock panel）
6. 規約・特商法・LP の文言を実装に合わせる（支払い時期「翌月 1 日」、トライアルの条件、申し込んだ月の扱い）。018 §6 のとおり 3 か所をそろえる
7. 引き継ぎスクリプト（テストモードで v1 相当の Subscription を作って通す）

### 9.2 ローカル

- `stripe listen --forward-to localhost:3000/api/stripe/webhook` の出す secret を `.env.local` に。クラウドのセッションでは外から Webhook を受けられないので、
  自分で署名したイベントを送って確かめる（§9.4-3）
- cron は `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/billing-usage`

### 9.3 テストクロックで確かめる筋書き

1. 10/15 に申し込む → 期間が 10/31 15:00 UTC で切り替わる / 初回（11/1）の請求書に 10/15〜月末の従量分が載るか
2. 11 月に 12 → 15 → 11 人と動かす → 12/1 の請求書が 15 人 = 500 円（旧料金のクーポン付きなら 250 円）
3. 2 月をまたいで anchor が月末（2/28・29）15:00 UTC になる
4. 10/10 にトライアルを始め（〜12/31）、11/10 に申し込む → 12/1・1/1 の請求書が 0 円、2/1 の請求書から 1 月の最大人数
5. 月の途中で解約（ポータル）→ 月末まで有料 → 翌月 1 日の請求書がその月の最大人数 → 以降 0 円・`canceled` → 10 人超ならロック
6. カードを `4000 0000 0000 0341`（請求で失敗）にする → `past_due` → リトライが尽きて `canceled`
7. 3D セキュアを求めるカード（`4000 0027 6000 3184`）で申し込み・月次の請求
8. 退会 → `cancel_at_period_end` → 月末の請求書が退会時の人数
9. 最終日の 23 時台の cron の後に人数を増やす → その増員は載らない（誤差として受け入れる）。cron を 1 日止める → 前日までの値で請求される
10. v1 の Subscription（API `2022-08-01`・旧 metered・トライアル付き）を作り、acacia で schedule を付けて引き継ぐ → 期間の終わりで Meter の price + クーポンに切り替わる・その間ポータルで解約できない
11. 旧料金の Subscription をポータルで解約 → 期間末に終わる → 申し込み直すと新しい Subscription にクーポンが付かない（新料金）
12. 旧料金の Subscription から割引を外す（§8.5）→ 次の請求書から新料金
13. v1 の `unpaid` の Subscription（期限切れのカード・下書きが溜まった状態）を作り、下書きを無効 → 最後の請求書を回収不能 → `active` に戻る → schedule を付ける →
    期間の終わりの請求が失敗 → `past_due`・支払い失敗のメール・アプリの帯 → カードを更新すると旧料金のまま続く / 更新しないとリトライ後に解約
14. schedule が付いた Subscription を `cancelDuringMigration()` で解約 → schedule が残ったまま期間の終わりに終わる・新料金に切り替わらない・ポータルで取り消せない
15. トライアルを使わずに申し込む → `trial_end` に Subscription の開始時刻が入る → 解約して期間が終わる → 11 人目で止まってもトライアルは案内されない（申し込みの案内になる）


### 9.4 クラウドのセッションで確かめる（引き継ぎ用の手順。2026-10-08）

実装（§12）のあと、Stripe と実際にやり取りする部分はまだ一度も動かしていない。新しいセッションで「019 の Stripe の確認をして」と頼まれたら、
この節を上から順に進め、結果を §12 に追記する。

#### 前提（ユーザーが済ませること）

| 項目 | 内容 |
| --- | --- |
| Stripe のサンドボックス | v1 と同じアカウントに**新しいサンドボックス**（例: `assift-v2-dev`）を作る。**従来のテストモードは使わない**: 一部の設定を本番と共有しており、「再試行が尽きたら解約」に変えると本番も変わりうる（カットオーバー前に本番の `unpaid` 134 件が解約され、救う 47 件を失う） |
| サンドボックスの設定 | 事業者名（公開情報）が入っている / 「すべての再試行が失敗したら」を**サブスクリプションをキャンセル**にする（シナリオ 6・13 で使う） |
| 鍵 | サンドボックスのシークレットキー（`sk_test_`）をクラウド環境の環境変数 `STRIPE_SECRET_KEY` に入れる。チャットには貼らない |
| ネットワーク | `*.stripe.com` / `*.stripe.network` / `*.stripecdn.com` を許可済み（2026-10-08） |

#### 0. 始める前に

- **`STRIPE_SECRET_KEY` が `sk_test_` か `rk_test_` で始まることを確かめる。** それ以外（live）なら何もせずユーザーに伝える。値そのものは表示しない（`${STRIPE_SECRET_KEY:0:8}` だけ見る）
- `curl -s -o /dev/null -w '%{http_code}' https://api.stripe.com/v1/balance -u "$STRIPE_SECRET_KEY:"` が 200 になること（ネットワークと鍵）
- DB が要るので AGENTS.md「クラウドのセッション」のとおり `supabase start`（使わないサービスを外す）→ `.env.local` を作る。
  `.env.local` には Supabase の 3 つに加えて `STRIPE_SECRET_KEY`（環境変数の値）・`STRIPE_WEBHOOK_SECRET`（適当な `whsec_` で始まる文字列を作る）・`CRON_SECRET`（`openssl rand -hex 32`）を書く。コミットしない
- このセッションは**外から Webhook を受けられない**。Stripe CLI も要らない: Webhook の確認は、Stripe から取った実際のイベント（`stripe.events.list`）の本文に
  `stripe.webhooks.generateTestHeaderString({ payload, secret })` で署名を付け、ローカルの `/api/stripe/webhook` に POST して行う

#### 1. 初期設定（`npm run stripe:setup`）

- 2 回流して 2 回目が「既存」だけになる（冪等）
- 見る: Meter の集計が `last`・customer_mapping が `stripe_customer_id`、Price の `lookup_key: assift_monthly`・tiers が 10 人まで 0 円 / 以降 100 円・税込（`inclusive`）、
  Coupon `assift_v1_legacy` が 50%・forever、ポータルの設定（請求書・支払い方法・宛名・期間末の解約・プラン変更なし）
- ポータルの作成が事業者名などの不足で失敗したら、エラーの内容をユーザーに伝える

#### 2. 画面から申し込む（Checkout）

- `npm run dev` → seed のユーザーでログイン → 在籍を 11 人にする（DB に直接 INSERT すると門番は `auth.uid()` が null なので止めない）→ 申し込みの確認画面 →
  Playwright で Checkout にテストカード `4242 4242 4242 4242` を入れて申し込む
- 見る: 戻り先 `/account/billing?checkout=success` で同期され「有料プラン」になる（Webhook が届かなくても描画時の同期で写る）、
  `billing_subscriptions` の期間が「今 〜 今月末日 15:00 UTC」、`profiles.trial_end` に Subscription の開始時刻が入る（トライアル未使用の場合）
- 「お支払い方法・請求書・解約」でポータルが開く（日本語）。ポータルで解約 → 再読み込みで「◯月◯日で終了予定」
- 申し込み済みの状態で確認画面を開くと `/account/billing` に戻される、`startCheckout` を直接呼んでも「有料プランをご利用中です」

#### 3. Webhook と cron の入口

- Webhook: 署名なし → 400、違う署名 → 400、正しい署名で `customer.subscription.updated` → 204 で `billing_subscriptions.synced_at` が進む、
  `customer.subscription.created` → 204 で Meter にイベントが 1 件届く（ダッシュボードの Meter の画面か `billing.meters.listEventSummaries`）
- cron: `Authorization` なし → 401、正しい Bearer → 200 で `{ sync: { synced, failed }, usage: { sent, failed } }`。`failed` が 0
- 同じ日に 2 回呼んでも Meter のイベントが二重に数えられない（identifier が同じ・`last`）

#### 4. テストクロック（§9.3 の筋書き）

Checkout で作った Customer にはテストクロックを付けられないので、**確認用のスクリプトを `scripts/stripe/verify/` に書いて**行う（本番コードは変えない）。

- Customer は `test_clock` 付きで作り、`profiles.stripe_customer_id` にその id を入れた利用者（seed とは別に作る）に結び付ける
- Subscription は Checkout と同じ中身で API から作る（`items: [{ price }]`・`billing_cycle_anchor_config: { day_of_month: 31, hour: 15 }`・`metadata`）。
  支払い方法は `pm_card_visa`（失敗は `pm_card_chargeCustomerFail`、3DS は `pm_card_authenticationRequired`）
- 最大人数の送信は `sendPeak()` を **`now` = テストクロックの `frozen_time`** で呼ぶ（テストクロックの Customer への送信は、クロックの時刻を基準に受け付けられるはず。未確認なので、違えば挙動を §12 に記録する）。
  人数の増減は `staff_count_history` に行を INSERT して作り、`reportUsageFor(userId, frozenTime)` で送ってもよい
- クロックを進めたら `syncCustomer()` を呼んでから DB と請求書を見る
- 優先順: **1（申し込んだ月の端数期間が初回の請求書に載るか。§11-4 を確定する）**→ 2 → 4 → 5 → 6 → 8 → 15 → 3 → 7 → 9。
  1 の結果が「載らない」なら、`proration_behavior`・確認画面と規約の「お申し込みの月は…」の文言を見直す案をユーザーに出す
- 見る: 請求書の金額（`monthlyPriceYen` と一致）、請求書の期間、`billing_subscriptions` の状態、画面（帯・ロック）

#### 5. v1 の引き継ぎ（§8.2。シナリオ 10・13・14・11・12）

- サンドボックスで v1 と同じ形の price（`id: freemium-monthly`、metered・`aggregate_usage: max`・tiered graduated・10 人まで 0 円 / 以降 50 円）を
  **API `2025-02-24.acacia`** で作れるか試す。作れなければ、その旨と次の案をユーザーに伝える
  （案: 従来のテストモードで、**ダッシュボードの設定には触らず API でオブジェクトを作る範囲だけ**確かめる。鍵はユーザーに別途用意してもらう）
- v1 相当の契約をテストクロック付きで 4 種類作る: 上限 15 人・`active` / 上限 15 人・`unpaid`（期限切れカード・下書きが溜まった状態）/ 上限 15 人・`unpaid`・編集なし / 上限 10 人。
  usage record（acacia）で上限人数を送っておく
- 入力の CSV を作って `npm run stripe:migrate-v1 -- --input … `（dry-run）→ `--apply --limit 1` → `--apply`
- 見る: 区分と操作が CSV のとおり、Customer の言語が `ja`、`legacy` / `rescue` に schedule（phase 0 は旧 price・phase 1 は `assift_monthly` + クーポン・1 日で release）、
  **phase 1 で `discounts` が通るか（通らなければ旧来の `coupon` に直す）**、release のあとも Subscription に price とクーポンが残る、
  `rescue` が `active` に戻る・下書きが無効・過去分が請求されない、`cancel_*` が解約される、2 回目の `--apply` で何も変わらない（冪等）
- クロックを期間の終わりまで進める: 旧料金の請求書が v1 の上限人数 × 50 円、次の期間から Meter の人数 × 100 円 × 50%
- `has_schedule` の間に「プランとお支払い」の「解約する」（`cancelDuringMigration()`）→ 期間の終わりで終わり、新料金に切り替わらない

#### 6. 退会（§5.8）

- 有料の利用者でアカウントを削除 → Meter に最後の人数が送られる・`cancel_at_period_end`（schedule 付きなら `end_behavior: cancel`）→ 退会できる → 期間末の請求書がその人数
- Stripe を止めた状態（鍵を外す・不正な鍵）で退会 → 「有料プランの解約に失敗しました」で退会しない

#### 7. 片付けと記録

- 作ったテストクロックを消す（Customer と Subscription も一緒に消える）。サンドボックスの Product / Meter / Price / Coupon は残す（本番と同じものを setup で作るので、次の確認でも使う）
- ローカルの DB は `npx supabase db reset` で seed に戻す
- 結果を §12 に「2026-10-xx Stripe のサンドボックスでの確認」として追記する（通った項目・見つけた不具合と直したこと・§11-4 の結論・残ったこと）。直したコードがあれば
  lint / typecheck / test / pgTAP を通してからコミット・プッシュする
---

## 10. やらないこと

- 年払い・クーポン（旧料金の 1 枚を除く）・請求書払い（振込）を Stripe で扱うこと（個別契約は `max_staffs_count` で手当てし、請求は従来どおり手作業）
- 管理画面（課金中の一覧・売上のグラフ。v1 の `admin/graph`）。必要なら Stripe の Dashboard で見る
- 店舗ごとの課金（v1 と同じく利用者単位）
- トライアルの終了前のメール（§7.1）
- v1 の `invoices` / `usage_records` の再現（v1 のダンプと Stripe の請求書で足りる）

---

## 11. 決定と未確定

| # | 論点 | 決定 / 推奨 |
| --- | --- | --- |
| 1 | v1 の利用者の「既存のプラン」をどこまで残すか | **決定**: 料金（1 人 50 円）だけ残し、仕組みは v2（月内の最大在籍数・1 人単位）にそろえる。新料金の price に 50% 引きのクーポン（無期限）で表す（§2.4） |
| 2 | 旧料金の対象 | **決定**: v2 のリリース時に v1 の有料プランを契約している利用者だけ。v1 の無料プランの人は新料金（§2.4） |
| 3 | トライアル | **決定**: カード不要・人数無制限・11 人目で始める・全員 v1 と同じ 2 か月後の月末まで（v1 で使った人は対象外）（§7） |
| 4 | 申し込んだ月の残りの期間 | **決定**: 申し込んだ日からのその月の最大人数で、翌月 1 日に請求する（テストクロックで確認。§4.3・§12）。規約・確認画面の文言はこのまま |
| 5 | 無料で 10 人を超えたとき | **決定**: シフト表をロック（共有・エクスポートは止めない） |
| 6 | `plan_change_logs` | **決定**: 移行せず、表ごと消す。元のデータは v1 のダンプに残す（§5.2・§8.1） |
| 7 | 旧料金の利用者が解約したあと | **決定**: 解約で旧料金は終わり、再び申し込むと新料金（クーポンが Subscription と一緒に終わる）。解約の手前の画面と告知で知らせる（§2.4） |
| 8 | 期間末の最終送信 | **決定**: `invoice.created` での送信をやめ、毎日 23:20・23:50 JST の 2 回の送信で済ませる（2026-10-08 に 2 回へ）。最後の 10 分の増員は誤差（§4.2） |
| 9 | 旧料金のクーポンの期間 | **決定**: 無期限。やめるときは告知してから外す（§8.5） |
| 10 | v1 で支払いが止まっている（`unpaid`）人 | **決定**: 90 日以内に使っている 47 件は救う。有効に戻して旧料金に移し、次の請求から通常の支払い失敗の流れに乗せる（§8.2.2） |
| 11 | 移行の進め方 | **決定**: 切り替え待ちの間の解約はアプリの画面で受ける / カットオーバーは月の下旬 / スクリプトは dry-run → 数件 → 残り（§8.2.3・§8.3） |
| 12 | 溜まった下書きの請求書 | **決定**: すべて無効にし、過去分は請求しない |
| 13 | 使っていない `unpaid`（87 件） | **決定**: カットオーバーで解約 |
| 14 | リトライが尽きたときの Stripe の設定 | **決定**: カットオーバーで「未払いにする」から「解約する」に変える |
| 15 | 有料プランで意図しない人数まで増やしてしまう | **決定（2026-10-09）**: 申し込み時に利用者が選ぶ上限人数（請求には使わない）と、料金が上がる追加の前の確認を足す。誤操作の猶予・席を請求の単位にする案は採らない（§13） |

---

## 12. 実装ログ

### 2026-10-07 実装（Stripe のテストモードでの確認を除く）

作ったもの（§6 のとおり。差分だけ書く）:

- スキーマ: `billing_subscriptions` / `staff_count_history`、`profiles.stripe_subscription_id` の削除、`plan_change_logs` の削除、
  門番と履歴のトリガ（`private.guard_staff_limit` / `record_staff_count` / `record_tenant_delete`）、`private.staff_limit`、`start_trial()`。
  差分 migration は `20261007214824_billing.sql`（`restrict_anon_grants.sql` を追記）。pg-delta が `restrictions_wdays_check` の drop / add を
  毎回出す既知の揺れも含む（中身は同じ）
- `lib/billing/`: §6 の一覧に加えて `limit`（上限の例外 → `code: 'staff_limit'`）/ `subscriptionRow`（Stripe → 写しの純関数）/
  `history`（区間の開始以前の最後の 1 行 + 区間内だけを読む。全部読むと年単位で `max_rows` に切られる）/ `cancel`（期間末の解約・schedule の終わらせ方）/
  `customer`（Customer の作成と保存。service_role を `lib/billing/` に閉じるため Action から出した）/ `migration`（引き継ぎの区分と CSV）
- 画面: `/account/billing`・`/account/billing/subscribe`、上限のモーダル（`openStaffLimitModal`）、トライアル / 支払い失敗の帯（`TenantShell` の `banner`）、
  シフト表のロック、スタッフ設定の `Alert`、アカウント画面のリンクと退会の文言、ヘッダーのアカウントメニューに「プランとお支払い」
- スクリプト: `npm run stripe:setup` / `npm run stripe:migrate-v1`（`tsx --conditions=react-server`。`assist:eval` と同じ）
- 規約「料金」に請求日（翌月 1 日）・申し込んだ月の扱い・無料トライアルの段落、特商法の支払い時期を「翌月 1 日」、LP にトライアルの 1 行（§9.1-6）
- 001 の `plan_change_logs` の記述に、019 で取りやめた旨を注記

プランから変えたこと:

- **Checkout の `payment_method_types` → `allowed_payment_method_types`**。SDK が固定する最新の API（`2026-09-30.endive`）で前者が廃止されていた
- **上限の例外を画面へ渡す口**: `ActionFailure` に `code?: 'staff_limit'` を足した（`ActionError` の第 2 引数）。文言は Action で日本語に差し替え、
  クライアントは `code` を見てモーダルを開く。モーダルの中身（トライアルを使えるか・上限）は開いてから `getUpgradeOffer()` で読む（どの画面からでも同じ内容にするため）
- `startTrial` / `getUpgradeOffer` / `openPortal` は店舗の画面・スタッフ設定・初期設定・プランの画面から呼ぶので `(protected)/actions.ts` に置いた。
  `startCheckout` / `cancelDuringMigration` は `account/billing/actions.ts`
- **初期設定で上限を超えたとき**は、保存の前ではなく「完成させる」を押したときにモーダルを出す（貼った名前の数と残りの枠を画面で数えるより、
  DB の門番の結果に寄せたほうが他の店舗の人数も正しく数えられる）。トライアルを始めたらそのまま完了をやり直す
- **申し込み直後の送信**は `customer.subscription.created` の Webhook で同期のあとに 1 回（§4.2）。`checkout.session.completed` だけでは Subscription がまだ無いことがある
- **切り替え待ちの間に解約した契約の `cancel_at`**: schedule を `end_behavior: cancel` にしても Subscription の `cancel_at` に出ない場合に備え、
  schedule の最後の phase の終わりを写す（`subscriptionRow`）
- **移行の schedule の phase 1 の長さは 1 日**にして release する（1 か月にすると、その間ポータルで解約できない）。release 後も price とクーポンが
  Subscription に残ることはテストモードで確かめる（下記）
- ロックは表だけでなくツールバー（共有・エクスポート・AI 作成のボタン）も覆う。発行済みの共有ページとエクスポートの URL は動くが、
  ロック中は画面から新しく共有・出力できない。止めないほうがよければ、ロックを表の部分だけにする

検証（このセッション）:

- `npm run lint`（既存の warning 1 件のみ）/ `npm run typecheck` / `npm test`（82 ファイル・761 件）/ `npx supabase test db`（213 件。うち billing 38 件）/ `npm run build`
- ブラウザ（Playwright・seed のユーザー）: 無料プランの「プランとお支払い」・申し込みの確認画面（Stripe 未設定でボタンが押せない）、
  在籍 10 人で 11 人目を追加 → モーダル →「無料で試す」→ そのまま追加され、トライアルの帯が出る、トライアルを過去にするとシフト表がロックされる

**まだ確かめていないこと**（Stripe のテスト用の鍵が要る。カットオーバーの前に必ず行う。手順は §9.4）:

1. §9.3 のテストクロックの筋書き（anchor・申し込んだ月の端数期間の請求・`last` の集計・期間末の解約・支払い失敗 → 解約）。結果で §11-4 を確定する
2. Webhook（ローカルで `stripe listen`）と `/api/cron/billing-usage`（`CRON_SECRET` を付けて手で叩く）
3. `stripe:setup` をテストモードで流す（Meter・Price・Coupon・ポータル）
4. `stripe:migrate-v1` をテストモードで v1 相当の Subscription（旧 metered price）に流す: acacia での schedule の作成・更新、
   phase 1 の `discounts`（通らなければ旧来の `coupon`）、release 後に price とクーポンが残ること、下書きの確定で請求やメールが走らないこと、
   回収不能で `unpaid` → `active` に戻ること、`cancelDuringMigration()` で期間末に終わること

### 2026-10-08 Stripe のサンドボックスでの確認

§9.4 の手順で、サンドボックス `assift-v2-dev`（v1 のアカウントの新しいサンドボックス）に対して確かめた。テストクロックの筋書きは
`scripts/stripe/verify/clock.ts`、v1 の引き継ぎは `scripts/stripe/verify/v1.ts`（どちらも確認用。本番コードは変えない。使い方はファイル冒頭）。
Checkout・ポータル・退会の画面は Playwright で通した。Webhook はこのセッションに届かないので、Stripe から取ったイベントに
`generateTestHeaderString` で署名を付けてローカルへ POST した。

**通った項目:**

| 項目 | 結果 |
| --- | --- |
| `stripe:setup`（§9.4-1） | 1 回目で作成、2 回目は既存だけ（ポータルは毎回「更新」= 設定の上書きで、想定どおり）。Meter `last`・`by_id`（`stripe_customer_id`）、Price `assift_monthly`（graduated・10 人まで 0 円 / 以降 100 円・`inclusive`）、Coupon 50%・forever、ポータル（請求書・支払い方法・宛名・期間末の解約・プラン変更なし） |
| Checkout（§9.4-2） | `4242…` で申し込み → `/account/billing?checkout=success` で描画時に同期され「有料プラン」。期間は「申し込み 〜 10/31 15:00 UTC」、`trial_end` に Subscription の開始時刻。申し込み済みで確認画面を開くと `/account/billing` に戻る |
| ポータル | 日本語で開く。解約は「2026年11月1日 までは引き続きご利用」。endive では解約が `cancel_at`（期間の終わり）に入り、`cancel_at_period_end` は false。`subscriptionRow` は `cancel_at` を先に見るので、同期で「終了予定」が写る |
| Webhook（§9.4-3） | 署名なし・形の違う署名・別の secret・本文の改ざん → 400、対象外の型・customer なし → 204、`customer.subscription.updated` → 204 で `synced_at` が進む、`customer.subscription.created` → 204 で Meter に 11 が届く |
| cron | 認証なし・違う Bearer → 401、正しい Bearer → 200（下の 2 件を直したあと `{ sync: { synced: 1, failed: 0 }, usage: { sent: 1, failed: 0 } }`）。2 回続けて呼んでも同じ |
| 1・2 申し込んだ月と月次 | 10/15 に 12 人で申し込み → **11/1 の請求書が 10/15〜11/1 の 12 人 = 200 円**（§11-4 を決定）。11 月に 12 → 15 → 11 人 → 12/1 に 500 円 |
| 3 2 月の anchor | 期間が 1/31 15:00 → 2/28 15:00 → 3/31 15:00 UTC（月末に寄る） |
| 4 トライアル中の申し込み | トライアル（〜12/31）中の 11/10 に申し込み → 12/1・1/1 は 0 円、2/1 に 1 月の最大 14 人 = 400 円 |
| 5・15 月の途中の解約 | ポータルと同じ `cancel_at` → 12/1 に 11 月の最大 13 人 = 300 円 → `canceled`、以降の請求なし。権利は `free`・10 人（トライアルは申し込みで使用済み） |
| 6 支払い失敗 | 2 回目の請求からカードが失敗 → 11/1 `past_due` → 11/22 までにリトライが尽きて `canceled`（請求書は `open` のまま残る） |
| 7 3D セキュア | `pm_card_authenticationRequired` で月次の請求 → `past_due`（請求書は `open`） |
| 8 退会 | `cancelSubscriptionsForAccountDeletion` → `cancel_at_period_end` → 期間末に 13 人 = 300 円。**ポータルで解約済み（`cancel_at` あり）の契約にも `cancel_at_period_end: true` を付けられる** |
| 退会（Stripe が止まっている） | 不正な鍵で dev を起動して画面から削除 →「有料プランの解約に失敗しました…」で退会しない |
| 10・14 v1 の引き継ぎ | acacia で `freemium-monthly`（plan。`id` を指定できるのは plans API だけ）と v1 相当の契約を作れた。dry-run → `--apply --limit 1`（区分ごとに 1 件）→ `--apply` → 2 回目の `--apply` は「schedule 既存」「対象外」だけ（冪等）。Customer の言語が `ja`、schedule は phase 0 が旧 price〜10/31 23:59:59 JST・phase 1 が `assift_monthly` + クーポンを 1 日・`release`。**acacia の phase 1 で `discounts` が通った**。期間の終わりの請求書が v1 の上限 15 人 × 50 円 = 250 円、release のあとも price とクーポンが残り、次の請求書が Meter の 15 人 × 100 円 × 50% = 250 円。切り替え待ちの間に `endScheduleAtCurrentPhase`（`cancelDuringMigration` の中身）→ `cancel_at` が写り、期間の終わりで `canceled`・新料金に切り替わらない。上限 10 人は即時解約 |
| 11・12 旧料金の終わり | クーポンは Customer に付いていない（申し込み直しに引き継がれない）。Subscription の割引を外すと次の請求書から 500 円 |

**見つけた不具合と直したこと:**

1. **Meter の identifier の重複は「捨てられる」のではなく `invalid_request_error` で断られる**（`An event already exists with identifier …`。code は付かない）。
   人数が変わらない日の cron が毎回「送信失敗」を数え、本当の失敗と見分けられなかった。`sendPeak` でこの断りだけを成功として扱う（`isDuplicateMeterEvent`。Vitest を足した）
2. **v1 の price（`freemium-monthly`）が無いアカウントで cron 全体が 500**（`subscriptions.list({ price })` が `resource_missing`）。同期だけでなく人数の送信まで止まり、
   請求が 0 円のまま進む。本番には今はあるが、旧料金をやめて price を消したとき（§8.5）やサンドボックス・プレビューで起きる。旧 price が無ければ飛ばす（`syncAllSubscriptions`）
3. **Checkout が Adaptive Pricing で USD を既定にしていた**（海外の IP から開くと USD が選ばれ「USD 通貨で請求する」と出る）。料金・規約は円（税込）なので、
   Session ごとに `adaptive_pricing: { enabled: false }` を付けた（`checkoutSessionParams`。Vitest を足した）。開き直して円だけになったことを確認
4. Checkout から戻ったときの「お申し込みが完了しました」が 2 回出た（開発時の StrictMode でエフェクトが 2 回）。通知に `id` を付けて重ねない

**確かめられなかったこと・残ったこと:**

- 13（`unpaid` の救済）は、ユーザーに設定を「未払いにする」へ一時的に変えてもらって続けた（下の節）
- 9（最終日の cron の後の増員・cron が 1 日止まる）は流していない。送信は「その時点までの最大」を `last` で送るだけなので、設計どおりの誤差になる
- **Webhook の endpoint を登録するときは API の版を `2026-09-30.endive` に指定する。** サンドボックス（= v1 のアカウント）の既定の版は `2019-08-14` で、
  `stripe.events.list` で取ったイベントもその版だった。ルートはイベントの `type` と `data.object.customer` しか読まないので版が違っても動くが、合わせておく
- ポータルの解約ダイアログで契約が「assift • ¥0 / 月」と出る（従量の price の最初の段が 0 円のため）。Stripe 側の表示で変えられない。
  「料金は使用状況により異なります」も併記されるので、告知・FAQ で触れる程度でよい
- 支払い失敗でリトライが尽きて解約になったあとも、請求書は `open` のまま残る（Stripe の「請求書の扱い」の設定次第）。カットオーバーで設定を見る項目に足す
- Checkout の国の既定は IP から決まる（海外からだと米国になり、郵便番号が必須になる）。日本からのアクセスでは日本になるので対応しない

### 2026-10-08 `unpaid` の救済（§9.3-13）

サンドボックスの「すべての再試行が失敗したら」を一時的に**未払いにする**へ変えて確かめた（`scripts/stripe/verify/v1.ts unpaid-setup` / `unpaid-after`）。
期限切れのカード（`pm_card_chargeDeclinedExpiredCard`）は Customer に付ける時点で断られるので、請求だけが失敗する `pm_card_chargeCustomerFail` で代えた。
10/31 の請求が 5 回失敗して `unpaid`、11/30・12/31 の請求書が下書きのまま溜まった状態（v1 の本番と同じ）を作り、`stripe:migrate-v1` を流した。

**見つけた不具合と直したこと（`scripts/stripe/migrate-v1-subscriptions.ts`）:**

1. **救う契約が `active` に戻らなかった**（「失敗: active に戻りません (unpaid)」）。下書きを全部無効にすると、Subscription の最新の請求書が
   無効の下書きになり、Stripe はそれでは `unpaid` を解かない。最新の下書きだけは無効にせず確定し（`auto_advance: false`）、失敗した請求書と一緒に回収不能にする
   （`voidDrafts(…, keepLatest)`）。これで `active` に戻った
2. **救わない契約（`cancel_unpaid`）の失敗した請求書が `open` のまま残った**。ポータルに未払いとして出て、同じ Customer で申し込み直したときに払えてしまう。
   過去分は請求しない（§11-12）ので、解約の前に回収不能にする

**通った項目:**

- 下書きの確定・無効・回収不能で支払いは試みられない（試行 0 回）
- `rescue`: 下書き 1 件を無効・回収不能 2 件 → `active` → schedule。期間の終わり（1/31）の旧 price の請求（250 円）はカードの失敗で `past_due`、
  画面の写しは新料金 + 50%（`discount_percent: 50`）。カードを更新して払うと `active`、release 後も旧料金で、次の請求書が 15 人 × 100 円 × 50% = 250 円
- `cancel_unpaid`: 下書き 2 件を無効・回収不能 1 件・解約。開いたままの請求書は残らない
- `cancel_free`（上限 10 人。請求が 0 円なので v1 でも `active` のまま）: 解約
- 2 回目の `--apply`: 救った契約は `active` になったので区分が `legacy` に変わり「schedule 既存」、解約した 2 件は「対象外」（冪等）

**設定の戻し:** サンドボックスの「すべての再試行が失敗したら」は確認のあと**キャンセル**に戻した（2026-10-08。本番もカットオーバーでキャンセルにする。§11-14）

### 2026-10-08 実装のレビュー（課金の差分全体）

`origin/main` からの課金の差分を見直し、出た指摘をコードとサンドボックスで裏付けてから直した。

**直したこと:**

1. **cron の同期が例外で終わると送信まで止まっていた** → 同期と送信を別々に受ける。どちらかが例外か、1 人でも失敗したら 500（`api/cron/billing-usage`）
2. **期間の最終日の送信が落ちると、その期間の増員は取り返せない**（翌日は新しい期間）→ cron を 1 日 2 回（23:20・23:50 JST。Vercel は Pro。`vercel.json`）。§4.2・§5.7・§11-8 を更新
3. **有効な契約の一覧（送信の対象・同期の取り直し）が `max_rows`（1000）で黙って切られる** → `listEntitledSubscriptions()`（`lib/billing/profile.ts`）で `pageAll()` を通す。
   1 期間の履歴（`readStaffCountHistory` の区間内）も `pageAll()` を通す
4. **在籍数の履歴が、同じ利用者の退職・削除の同時実行で実際より多いまま残る**（どちらもロックせずに数えるため、11 → 2 人同時に退職で最後が 10）→
   `private.record_owner_staff_count()` が数える前に利用者の行を `for update` でロックする（門番と同じロック。`append_staff_count` を置き換え）。
   差分 migration `20261008023743_billing_staff_count_lock.sql`（`restrict_anon_grants.sql` を追記）。2 つのセッションで同時に退職させ、最後が実際と同じ 9 になることを確かめた
5. `profiles` の `stripe_customer_id` / `trial_end` を service_role で読む処理（4 か所）を `readBillingProfile()` に、有効な状態の直書き（3 か所）を `ENTITLED_STATUSES` にまとめた
6. 退会（`deleteAccount`）のコメントを実際に合わせた: Customer がある人は Stripe が止まっていると退会できない（請求できないまま消さない。意図どおり）。
   解約のあとで削除が失敗すると有料プランだけが期間末で終わるが、期間末まではポータルで取り消せるので受け入れる

**直さなかったこと:**

- 旧 price のまま schedule の無い契約を endive で `cancel_at_period_end` にすると失敗する、という指摘 → サンドボックスで試すと通った（再現しない）
- 全員の同期が 1 人ずつ順に動く → 数百人なら数秒で、`maxDuration`（300 秒）に収まる

**確認:** lint / typecheck / test（764 件）/ pgTAP（213 件）。サンドボックスで `clock.ts monthly`（200 円 → 500 円）と `deletion`（300 円）を流し直し、前と同じ結果。
cron は不正な鍵でも同期の失敗のあとに送信を試み、500 を返すことを確かめた

### 2026-10-08 実装のレビュー（2 回目。Vercel は Pro）

**cron の時刻:** Vercel は Pro で、指定した分に走る。23:20 と 23:50 JST（`20 14 * * *` / `50 14 * * *`）にし、取りこぼしを最後の 10 分に縮めた（§4.2・§5.7・§11-8）。

**直したこと:**

1. **切り替え直後の 1 日に解約すると、その翌日で終わっていた**（`endScheduleAtCurrentPhase`）。移行の schedule は旧 price の phase のあとに新料金の phase を
   1 日だけ付けている。その間に「解約する」（`cancelDuringMigration`）や退会をすると、新料金の phase の終わり（1 日後）で解約になり、月の途中で上限 10 人に落ちていた。
   今の phase が旧 price でなければ、schedule を release して通常の `cancel_at_period_end` にする。サンドボックスで、切り替えの 2 時間後に解約し、
   schedule が外れて新しい期間の終わり（11/30 23:59:59 JST）まで `active`・そこで `canceled`・クーポンが残ることを確かめた（`v1.ts switch-setup` / `switch-cancel`）。
   画面の「この期間は v1 で選んでいた上限人数で請求」は、schedule の有無ではなく旧 price かどうかで出す（`legacyPeriod`）。料金の見込みも新料金になった時点から出す
2. **新旧両方の price を持つ契約を、自分の二重契約として解約しうる**（`syncAllSubscriptions` は price ごとに一覧を取るので同じ契約が 2 回入る）。
   取り込むときに id で重複を除き、`chooseSubscription` でも同じ id を解約の対象にしない（Vitest を足した）
3. 全員の同期で失敗した人を、取り直しのループでもう一度同期していた（Stripe への呼び出しと件数が二重）→ 先に「見た」に入れる
4. 保存してある Customer が Stripe で消されていると、申し込みが失敗し続けた → `ensureCustomer` が消えた Customer を外して作り直す。申し込みは常にこれを通す
5. Customer はあるが契約が無い人（Checkout を開いて戻った人）は、「プランとお支払い」を開くたびに Stripe を呼んでいた → 写しが無いときは Checkout からの戻りだけ取り直す
6. proxy の matcher の除外を `api/stripe/` `api/cron/` にした（`api/stripe` で始まる別のパスまで外していた）
7. 店舗の layout で課金の状態を他の読み取りと並行に読む（直列で往復が 1 回増えていた）。`idOf` を `lib/billing/cancel.ts` から共有した

**直さなかったこと:** 旧 price のまま schedule の無い契約を endive で `cancel_at_period_end` にすると失敗する、という指摘（1 回目と同じ）→ 1 回目にサンドボックスで試して通った。

**確認:** lint / typecheck / test（765 件）/ pgTAP（213 件）。

### 2026-10-08 実装のレビュー（3 回目）

指摘は 10 件で、1・2 回目とは別の箇所だった（直したものの再発は無い）。重さ順に、直すべきもの 3 件・規約と整理 4 件を直し、性能・重複の 3 件は見送った。

**直したこと:**

1. **Stripe で Customer を消すと、写しが有効のまま残った**（`syncCustomer` は消えた Customer で何も書かずに戻っていた）。Customer を消すと Subscription は即時に解約されるので、
   人数の上限なし・請求なしで使えてしまう。持ち主が分かれば写しを消す。サンドボックスで、申し込み → Customer を消す → 同期で写しが無くなることを確かめた（`clock.ts deleted-customer`）
2. **Customer の Subscription を先頭 20 件しか読んでいなかった**（同期と退会）。解約と申し込みを繰り返した人は有効な契約を見落とす → `listCustomerSubscriptions()` で全件を読む
3. **他人の店舗にスタッフを足そうとすると、RLS より先に門番が上限を判定していた**（BEFORE トリガは WITH CHECK より先に動く）。上限エラーが返ることで店舗の存在と相手のプランが分かり、
   相手の行もロックしていた → 自分の店舗でなければ門番は何もせず RLS に弾かせる。あわせて **`profiles.stripe_customer_id` を一意にした**（2 人が同じ Customer を指すと、
   片方がもう片方の請求をポータルで見られ、同期の持ち主も決まらない）。差分 migration `20261008043406_billing_guard_owner_customer_unique.sql`、pgTAP を 2 件足した
4. AGENTS.md の service_role の例外に、「プランとお支払い」の描画時の同期と `cancelDuringMigration()` を足した
5. 同期の持ち主の読み取りを `readBillingOwner()`（`lib/billing/profile.ts`）にまとめた
6. 旧料金の単価の表示を `monthlyPriceYen()` から出す（画面で別に計算していた）
7. 店舗の layout で、課金の状態が読めなくても帯を出さずに描く（店舗の画面ごと落とさない）

**見送ったこと:** `reportAllUsage` の利用者ごとの `profiles` の読み取り（800 人でも並行 10 本で数秒）/ プランの画面の重複した読み取り（往復 2 回）/
`peakWindow` と `billableStaffPeak` の区間の計算の重複（今は一致しており、まとめ直すほうが危うい）。

**確認:** lint / typecheck / test（765 件）/ pgTAP（215 件）。サンドボックスで `clock.ts deleted-customer` / `monthly`（200 円 → 500 円）/ `deletion`（300 円）。

### 2026-10-08 実装のレビュー（4 回目）

指摘は 10 件。直したもの 6 件、再現しないもの 1 件、見送り 3 件（N+1・区間の計算の重複・同じ呼び出しの重複のうち前回と同じもの）。

**直したこと:**

1. **本番の制限付きキーの権限一覧に Prices（読み取り）が無かった**（`.env.example`・§4.1）。`resolvePriceId()` が lookup_key で price を引くので、
   一覧のとおりに鍵を作ると申し込みも毎晩の同期も失敗する。`stripe:setup` と移行スクリプトは別の鍵で流すことも書いた
2. **毎晩の同期が、処理中に Webhook が書いた新しい写しを古い一覧で上書きしえた**（解約された契約が有効に戻り、次の同期まで上限なし）→
   一覧を取った時刻より後に写しが書かれていれば、その人は書き換えない
3. **シフト表とスタッフ設定のページは、課金の状態が読めないとページごと落ちた**（3 回目で layout だけ直していた）→
   `getCurrentBillingOverview()`（`lib/queries/billing.ts`。読めなければ null）に寄せ、layout・シフト表・スタッフ設定の 3 か所の書き写しをなくした。
   読めないときはロックを掛けない側に倒れる（スタッフを増やす操作は DB の門番が止める）
4. **metadata から持ち主を引くとき、その人が別の Customer を持っていても結び付けていた**（残骸の Customer の状態で本物の写しを上書きしうる）→ Customer がまだ無い人だけ
5. **未払い・未完了の契約が残っていても申し込めた**（Meter は Customer 単位なので同じ人数が 2 件に請求される）→ `startCheckout` で断り、支払いか問い合わせを案内する
6. シフト表のロックの画面で、トライアルを使える人には「無料トライアルを始める」を案内する（有料プランだけを出していた）

**再現しないもの:** 消えた Customer で退会できない → Stripe は消えた Customer の契約一覧に空の一覧を返す（サンドボックスで確認）。

**確認:** lint / typecheck / test（765 件）/ pgTAP（215 件）。サンドボックスで `clock.ts deleted-customer` / `monthly` / `deletion`、cron（200）、ブラウザでシフト表とスタッフ設定を開いた。

### 2026-10-08 有料プランを解約していなければ退会できないようにした

- 判定は `blocksAccountDeletion()`（`lib/billing/entitlement.ts`。Vitest）: 有効な状態（`active` / `trialing` / `past_due`）で `cancel_at` が無い。画面と `deleteAccount` が共有する
- `cancelSubscriptionsForAccountDeletion()` が同期のあとに判定し、`PlanStillActiveError` を投げる。`deleteAccount` はそれを「先に解約してください」の案内に写す
- アカウント情報: 解約していなければ削除のボタンを押せなくし、「プランとお支払い」へのリンク付きで案内する。解約済みなら確認ダイアログに「アカウントを削除しても、有料プランの最後のご請求（◯月ご利用分）は◯月◯日に行います」を出す
- 確認: サンドボックスで、解約前の退会が断られ、ポータルと同じ形（`cancel_at`）で解約した直後（Webhook を待たずに）なら通ること（`clock.ts deletion-blocked`）。ブラウザで 2 つの状態の表示

### 2026-10-08 退会時の即時解約を確かめ、期間末の請求のままにした（決定）

解約を予約中の利用者がアカウントを削除したとき、その場で `subscriptions.cancel(…, { invoice_now: true })` で解約して請求できるかを
サンドボックスで確かめた（`scripts/stripe/verify/immediate.ts`。テストクロックを使わない実時間の Customer）。

| 筋書き | 期待 | 下書きの間 | 確定したあと |
| --- | --- | --- | --- |
| 13 人を送った直後に解約 | 300 円 | 0 円（3 分後も） | 手で確定して 300 円 |
| 同上・Stripe の自動の確定（約 60 分後）を待つ | 300 円 | 0 円 | 300 円（支払い済み） |
| 12 人を送って 1 分後に 15 人を送り、直後に解約 | 500 円 | 200 円 | （確かめていない） |
| 13 人を送って 1 分待ってから解約 | 300 円 | 300 円 | — |

- 即時解約の請求書は下書きで作られ、直前に送った人数はまだ載らないが、確定のときに Meter の集計を読み直して正しい金額になる。即時解約でも取りこぼしは無い
- それでも**期間末の請求のままにする**。退会できるのは解約を予約した人だけ（上の節）なので、退会の処理は今の期間の人数を送って消すだけで、
  Stripe の契約に手を入れない。即時解約にすると「予約した解約を即時に書き換える」処理と、請求の時期が 2 通り（解約だけ = 期間末、退会 = 退会の約 1 時間後）になり、
  v1 の切り替え待ちの契約（旧 price）の即時解約も確かめ直しになる。退会のあとに請求が来ることは、確認ダイアログの
  「アカウントを削除しても、有料プランの最後のご請求（◯月ご利用分）は◯月◯日に行います」で知らせる

### 2026-10-08 「プランとお支払い」の見た目を作り直した

デザイン案（A: ステータスとメーター）をもとに、表 1 枚だった画面を 3 枚のカードにした（`BillingClient.tsx`）。見出しは他の設定画面と同じく枠の外（`SettingsSection`）、プランのバッジは枠の中の一番上。

- **プラン**: バッジ（トライアル中・無料・有料・個別契約。支払いの失敗を優先）、大きな数字（トライアルは「あと N 日」、最終日は「今日まで」。有料は今の期間の料金の見込み）、
  トライアルの期間のバー（`trialProgress()`。始めた日は持っていないので始めた月の 1 日から数える）、ボタンをカードの中に置く（トライアル中に空の枠が残っていた）。
  無料プランでトライアルを使えるなら、カード不要のトライアルを先に勧める
- **在籍スタッフ**: 上限があるとき（トライアル中は終わったあとの無料の上限）は 10 マスのメーターと「あと N 人まで無料」。超えていれば赤
- **料金**: 表をやめ「10 人まで　無料」「11 人目から　1 人 100 円 / 月」の 2 行。「翌月 1 日に請求します」は「翌月 1 日にお支払いいただきます」に
- 段落の折り返し: `globals.css` で `p { text-wrap: pretty; word-break: auto-phrase }`（最後の行に数文字だけ落ちるのを防ぐ。auto-phrase は Chrome だけ）
- 確認: スマホ幅で、トライアル中・無料・上限超え・有料・旧料金で支払い失敗かつ解約予定の 5 つの状態


---

## 13. 上限人数と、料金が上がる前の確認（2026-10-09 追加。実装済み。ログは §13.10）

### 13.1 背景

有料プランは「その請求期間の在籍スタッフの最大人数」で請求する（§4.2）。上限が無いので、仕組みを知らずにスタッフを増やすと、意図しない額の請求になりうる。
特に初期設定（014）は名前を貼るだけで 1 回に 100 人（`SETUP_STAFFS_MAX`）まで確認なしで足せ、すぐ消しても**その期間の最大人数は下がらない**。

| 状態 | 誤ってまとめて足したとき |
| --- | --- |
| 無料プラン | 門番（§5.3）が 11 人目で止める |
| トライアル中（申し込みなし） | 請求の区間はトライアルの終わりから（§4.2）。終わる前に減らせば請求されない |
| **有料プラン** | **止まらず、その期間はその人数で請求される**（例: 2 店舗目の初期設定で Excel の列を丸ごと貼る → 100 人で 9,000 円） |

v1 から引き継ぐ旧料金の 392 件は、v1 の上限で止まるのに慣れていて、§8.4 では「上限で止まることが無くなる」と告知する予定だった。いちばん影響を受ける層になる。

### 13.2 決定（2026-10-09）

| # | 論点 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | シート（席）の考え方 | **上限としてだけ入れる。請求は今のまま実人数の最大**。席を請求の単位にする（licensed の数量・前払い）のは採らない | 席を請求の単位にすると、月の途中の増減で比例配分の請求書が出て「月末締め・最大人数」と合わない（§3 で退けた形）。規約・LP・Meter・移行の作り直しになり、v1 の「上限人数を選ばせて、その分を請求する」に戻る |
| 2 | 誤操作の猶予（その日のうちに消したら数えない、など） | **採らない** | 上限で大量の誤りは止まり、上限の内側の誤りは確認（§13.5）で気付ける。数え方が分かりにくくなり、確認の「減らしても料金は下がりません」と食い違う。規約の第 8 条は変えない |
| 3 | 上限を決めるとき | **申し込みの確認画面で利用者が選ぶ**。運営が決めた固定の値（15 や 20）にはしない | 固定の値だと、トライアル中に 25 人で運用している店舗が申し込んだ瞬間に上限を超える。自分で決めた数なら止まっても納得しやすい。最終確認画面に「毎月の料金は最大 ◯円」と書ける（018 §6） |
| 4 | 最初に入っている値 | **今の在籍数より大きい、次の 5 の倍数（最小 15）**。8 → 15、12 → 15、15 → 20、23 → 25 | 余裕は常に 1〜5 人。上限が小さいほど誤りの被害が小さく、引き上げは 1 クリックで済む。ちょうど 5 の倍数のときに余裕 0 にならない |
| 5 | 「上限なし」 | **作らない**。有料プランは常に上限がある | 説明が 1 本で済む。引き上げが軽いので困らない |
| 6 | 旧料金の人 | **v1 の上限（`max_staffs_count`）を引き継ぐ**。今の在籍数のほうが多ければ在籍数 | v1 で慣れた安全装置が残る。§8.4 の「上限で止まらなくなる」が無くなる |
| 7 | 料金が上がる追加の前の確認 | **入れる**（§13.5） | 上限の内側の誤りに気付ける。最大人数の請求なので「最大人数までは足しても料金が変わらない」ことも伝えられる |

### 13.3 権利の規則（§5.1 を変える）

| 状態 | 在籍スタッフの上限 |
| --- | --- |
| サブスクリプションが `active` / `trialing` / `past_due` | **`profiles.staff_cap`**（従量で請求。null は下の同期で埋まるまでの一時的な状態で、上限なしとして扱う） |
| トライアル中（申し込みなし） | なし（請求なし。今のまま） |
| 個別契約 | `profiles.max_staffs_count`（今のまま） |
| それ以外 | 10（今のまま） |

- トライアル中に申し込んだ人は、申し込んだ時点から上限が効く（1 行目が先に当たる）
- **上限人数ではシフト表をロックしない。** ロック（§5.4）は無料・個別契約の上限を超えたときだけ（トライアルの終わり・解約・支払い失敗の後）
- `entitlement.ts` の `{ kind: 'subscription' }` に `cap: number | null` を持たせ、`staffLimit()` はそれを返す。SQL の `private.staff_limit()` も同じ規則にし、両方をテストで固定する
  - **`isOverLimit()` は今 `staffLimit()` をそのまま使っているので、変えないと上限人数を超えた有料の人がロックされる。** `subscription` のときは常に false を返すよう書き換える
- **上限人数を在籍数が上回ることはある**（避けない）: トライアル中に確認画面で上限を保存してから、Checkout を終える前に別の画面でスタッフを足した /
  解約したときの古い値が残ったまま、確認画面を通らずに申し込んだ（同期は null のときしか埋めない）。そのときは
  ロックせず、足す操作だけ門番が止める。「プランとお支払い」は「上限 25 人（在籍 30 人。上限を超えています）」と出し、変更の下限は在籍数なので引き上げれば直る

### 13.4 上限人数

#### スキーマ

```sql
-- profiles: 列を足す
-- 有料プランの在籍スタッフの上限（019 §13.3）。請求には使わない（請求は実人数の最大）。
-- 書くのは public.set_staff_cap()（利用者）と、同期関数（null のとき既定値で埋める）・データ移行（v1 の上限。§13.7）だけ
staff_cap integer check (staff_cap between 11 and 1000)
```

- 解約しても値は残す（申し込み直すときは確認画面で選び直す。最初に入っている値は §13.2-4 の規則で、残っている値は使わない）
- 上の限りの 1000 は入力の誤り（桁の打ち間違い）を止めるためのもの。定数は `lib/validation/` の Zod に置き、SQL の check と合わせる

#### RPC `public.set_staff_cap(p_cap integer)`

`profiles` に `authenticated` の UPDATE を付けない方針（§5.2）なので、`start_trial()` と同じく `security definer` の RPC にする。

- `auth.uid()` の行だけ（引数で利用者を受けない）。`set search_path = ''`
- 門番と同じく `profiles` の行を `for update` で取ってから、`p_cap >= greatest(在籍数, 11)` と `p_cap <= 1000` を確かめる。違えば `raise`（Action 側で日本語にする）
  - ロックしないと、上限を下げるのと同時にスタッフを足されて、上限を超えた状態ができる
- 有料プランでなくても書ける（申し込みの確認画面で、Checkout に進む前に保存するため。下の「申し込み」）。効くのは有料プランのときだけ
- `execute` は `authenticated` だけ。pgTAP: 在籍数より下は例外 / 11 未満・1000 超は例外 / 他人の行は変えない / anon は 42501 / 有料プランで上限まで足すと次の 1 人が P0001

#### 既定値の純関数（`lib/billing/staffCap.ts` + test）

```ts
/** 最初に入っている値: 在籍数より大きい次の 5 の倍数（最小 15）。8 → 15、12 → 15、15 → 20、23 → 25 */
export function suggestedStaffCap(activeStaffCount: number): number
/** 選べる下限: max(在籍数, 11) */
export function minStaffCap(activeStaffCount: number): number
```

#### 申し込み（`/account/billing/subscribe`・`startCheckout()`）

- 確認画面に「在籍スタッフの上限」の `NumberInput`（最初は `suggestedStaffCap(在籍数)`、下限 `minStaffCap(在籍数)`）を置き、その下に
  「上限 20 人の場合、毎月の料金は最大 1,000 円です。請求するのは実際の人数（その月に最も多かったときの人数）で、上限までの人数分ではありません」。数字は入力に合わせて変わる
- 特商法 12 条の 6 の最終確認（018 §6）の「料金」の欄に、上限と最大の月額を足す
- `startCheckout({ staffCap })`: `requireUser()` → Zod → **`set_staff_cap()` を呼んでから** Checkout Session を作る。
  Checkout を途中でやめても値が残るだけで、効くのは有料プランになってからなので害がない（Checkout の metadata 経由で同期に渡すより、書く口が 1 本で済む）。
  画面を開いたあとに在籍が増えて RPC が断ったら「上限は在籍している人数（◯人）以上にしてください」（`setStaffCap` と同じ文言。`lib/billing/limit.ts` に寄せる）
- **同期の保険**: 同期関数（`syncCustomer`）が有効な Subscription を写すとき `staff_cap` が null なら、その時点の在籍数から `suggestedStaffCap()` で埋める
  （`applySubscriptions()` の `trial_end` を埋めるのと同じ場所なので、Webhook・cron の一覧の同期の両方を通る。`.is('staff_cap', null)` で上書きしない）。
  確認画面を通らない申し込み（Dashboard で手で作った契約など）でも上限が付く。在籍数は service_role で読むので、`staffs` を `tenants.owner_id` で 1 人に絞る（§5.6 の規律）

#### 変える（「プランとお支払い」）

- 有料プランのとき、在籍スタッフのカードに「上限 20 人（あと 8 人）」と「変更」。変更のモーダルは確認画面と同じ入力と「最大 ◯円」の表示
  （「最大 ◯円」はどこでも `monthlyPriceYen(上限, discountPercent)`。旧料金の人は割引後の額）
- 在籍数より下にはできない（入力の下限。RPC も断る）。下げたいときは先にスタッフを退職にする、と添える

#### 上限で止まったとき（`openStaffLimitModal` を広げる）

- このモーダルは**誤ってまとめて足したときに最初に出る画面**なので、引き上げを 1 クリックで通さない。何を足そうとしているかを先に見せる:
  「在籍スタッフの上限（20 人）に達しました。100 人を追加しようとしています（在籍 12 人 → 112 人）」
  - 上限の入力（最初の値は `suggestedStaffCap(足したあとの人数)`。1000 を超えるなら 1000 にし、足りないことを書く）と「上限 115 人の場合、毎月の料金は最大 10,500 円」
  - §13.5 の確認の条件に当たるなら、同じモーダルに今の期間の料金の見込み（「200 円 → 10,200 円」）も出す。**確認を 2 回続けて出さない**
  - ボタンは「上限を 115 人にして 100 人を追加する」（人数を入れる）。押すと `set_staff_cap` → 元の操作を `acknowledgedPeak` 付きでやり直す（`onTrialStarted` と同じ形で `onCapRaised(acknowledgedPeak)`）
- 何人足そうとしたかはクライアントがモーダルに渡す（`adding`。初期設定は名前の数、1 人ずつの追加・復帰は 1）
- 中身は今と同じく開いてから Action で読む（`getUpgradeOffer({ adding })` に `cap`・`activeStaffCount`・料金の見込みを足す）

#### スタッフの設定

- 有料プランで在籍が上限に達したら、`StaffLimitAlert` に「有料プランの上限（在籍 20 人）に達しています」+「上限を変える」（変更のモーダル）。今は無料・個別契約のときだけ出している
- 有料プランのときは、上限に達していなくても一覧の上に 1 行出す: 「上限 20 人・在籍 12 人」。今の期間の最大人数が在籍数より多ければ
  「今の期間はすでに 15 人分の料金なので、あと 3 人までは料金が変わりません」を続ける。
  最大人数は `getPeriodPeak()`（履歴の読み取り）なので、このページで有料プランのときだけ読む（`getCurrentBillingOverview()` には足さない。店舗の全画面の描画に効くため）

### 13.5 料金が上がる前の確認

最大人数で請求するので、**今の請求期間の最大人数を超えるときだけ**料金が上がる。そのときだけ確認を出す。

- 対象: スタッフの追加（`createStaff`）・復帰（`restoreStaff`）・初期設定の完了（`completeSetup`。RPC の `complete_setup` を呼ぶ前に見る）。AGENTS.md の「スタッフを増やす経路を足したら」に確認も足す
- 出す条件: 有料プランで、請求の区間が始まっていて（トライアルの終わりを過ぎている）、切り替え待ち（`has_schedule`）でなく、
  **足したあとの在籍数 > 今の期間の最大人数（ここまで）**。トライアル中・切り替え待ちの間は出さない（今の期間の請求は変わらず、
  次の期間の始まりまでに減らせば請求されない。トライアル中に申し込んだ人の帯と確認画面の「トライアルの終わる ◯月◯日の人数から請求」で知らせる）
- 読み取りを増やしすぎない: Action はまず `billing_subscriptions` の行だけを読み、有料プランでなければここで終える（無料・トライアルの追加は DB への読み取りが 1 回増えるだけ）。
  有料のときだけ `profiles.staff_cap` と履歴を読む
- 流れ（上限の `staff_limit` と同じ形。料金が上がらない追加は、画面とサーバーの往復が増えない）:
  1. Action が書き込む前に、有料プランなら**先に上限人数、次に料金**を見る。足したあとの在籍数が上限を超えるなら書き込まずに `code: 'staff_limit'`
     （§13.4 のモーダルが料金の見込みも出す）、超えず料金の条件に当たるなら `code: 'price_increase'`（新しい `ActionError` の code）。
     順を逆にすると「料金を確認 → やり直したら上限で止まる → また確認」と 2 回続く。門番（DB）は同時の追加への守りとしてそのまま残す
  2. クライアントが確認のモーダルを開く。中身は Action（`getPriceIncreaseQuote({ adding })`）で読む:
     「12 人を追加します。今の請求期間（10 月 31 日まで）の料金の見込みは 1,500 円 → 2,700 円になります。期間の途中で減らしても、この期間の料金は下がりません」
  3. 「追加する」で、同じ Action を `acknowledgedPeak`（確認した足したあとの人数）を付けてやり直す。サーバーは、足したあとの人数が `acknowledgedPeak` 以下なら通す
     （確認のあいだに別の画面で増えていたら、もう一度確認になる）
- 最大人数より下にいるとき（例: 今月は 25 人まで在籍した後、20 人に減らした）は確認を出さない（スタッフの設定の 1 行は §13.4）
- 金額は `monthlyPriceYen(人数, discountPercent)`（旧料金の割引も効かせる）。期間の最大人数は `getPeriodPeak()`（`lib/queries/billing.ts`）を使い回す
- 門番（DB）は確認を見ない。確認は画面の親切で、最後の守りは上限人数（§13.4）が担う

### 13.6 文言（規約・特商法・LP。018 §6 のとおり 3 か所をそろえる）

- 利用規約「料金」に 1 段落足す: 「有料プランでは、あなたが設定した上限の人数まで在籍スタッフを登録できます。上限はいつでも変更できます（在籍している人数より少なくはできません）。
  料金は上限ではなく、実際に在籍したスタッフの人数で決まります」。料金の計算（その月の最大人数）は変えない
- 特商法の表記「販売価格」に「上限の人数（お申し込み時に設定）を超えて登録することはできません」を足す
- LP の料金: 「有料プランは上限の人数を決めておけるので、それを超える請求にはなりません」を足す（文言は実装時に決める。「思わぬ請求になりません」は上限の内側の誤りがあるので言い過ぎ）
- 今の画面で「有料プランは人数の制限なし」と書いているところを直す: `StaffLimitAlert`（「有料プランに申し込むと、人数の制限なく使えます」）、
  `BillingClient`（有料プランの説明の「在籍スタッフの人数の制限なく使えます」・在籍スタッフのカードの「人数の制限なし」）。トライアルの「人数の制限なく試せます」はそのまま

### 13.7 v1 からの引き継ぎ（§8 に足す）

- §8.1 の表（データ移行。001 §5 のインポート）に行を足す: **v1 で Subscription があり、上限が 11 人以上の利用者**は
  `staff_cap = least(greatest(v1 の max_staffs_count, 移行時点の在籍数), 1000)`。1000 で切ったものが無いことを移行の検証で数える
  - 書くのはデータ移行で、Stripe の引き継ぎスクリプト（§8.2）ではない。順序は §8.3 のとおりデータ移行 → 引き継ぎ → 全員の同期なので、
    同期の「null なら埋める」より先に入り、上書きされない
  - 解約される 87 件（§8.2.2）にも入るが、効くのは有料プランのときだけで、申し込み直すときは確認画面で選び直すので害はない（区分を移行で分けなくて済む）
  - v1 で `over_limit?`（上限を超えて在籍）の人は在籍数に合わせる
- §8.4 の告知の「上限で止まることが無くなるので、人数を増やすとその月から料金が変わる」を、
  「これまでの上限の人数はそのまま引き継ぎます。上限は『プランとお支払い』から変えられます。料金は上限ではなく、その月の実際の最大人数で決まります（同じ人数なら今より高くなりません）」に差し替える
- 上限 10 人（0 円）の Subscription の人と、Subscription の無い人は `staff_cap` を入れない（null）

### 13.8 テスト

- Vitest: `suggestedStaffCap`（8 → 15、12 → 15、15 → 20、23 → 25、0 → 15）・`minStaffCap`、`entitlement`（有料プランで `cap` が返る / null / 上限を超えても `isOverLimit` が false）、
  確認を出す条件の純関数（区間の前・切り替え待ち・最大人数ちょうど・超える・`acknowledgedPeak`・上限を超えるときは料金より先に `staff_limit`）
- pgTAP: `staff_limit()` が有料プランで `staff_cap` を返す / 有料プランで上限の次の 1 人が P0001・初期設定のまとめて追加でも上限の行で止まる / `set_staff_cap()`（§13.4）
- 画面: 確認画面の入力と最大の月額 / 初期設定で上限を超える人数を貼る → 上限のモーダル 1 回（料金の見込みつき）で引き上げてそのまま完了 / 料金が上がる追加の確認 /
  最大人数より下では確認が出ない / 上限を在籍数が上回った状態でロックされない

### 13.9 ファイル

```
supabase/schemas/public/tables/profiles.sql      staff_cap
supabase/schemas/private/functions.sql           staff_limit()（有料プランは staff_cap）
supabase/schemas/public/functions.sql            set_staff_cap()
supabase/migrations/<ts>_staff_cap.sql           declarative sync --name staff_cap（関数を足すので unmanaged/restrict_anon_grants.sql を追記）
supabase/tests/billing.sql                       §13.8
src/lib/billing/staffCap.ts (+test)              既定値・下限
src/lib/billing/entitlement.ts (+test)           subscription に cap。isOverLimit は subscription で false
src/lib/billing/limit.ts                         set_staff_cap の例外 → 日本語
src/lib/queries/billing.ts                       BillingOverview に staff_cap
src/types/database.ts                            gen types
src/lib/billing/priceIncrease.ts (+test)         確認を出す条件（純関数）
src/lib/billing/sync.ts                          staff_cap が null なら埋める
src/lib/validation/billing.ts                    上限人数の Zod（11〜1000。日本語のエラー）
src/app/(protected)/actions.ts                   getUpgradeOffer に cap、setStaffCap、getPriceIncreaseQuote
src/app/(protected)/account/billing/...          確認画面の入力・startCheckout の引数・上限の変更
src/components/billing/StaffLimitModal.tsx       有料プランの上限の引き上げ
src/components/billing/PriceIncreaseModal.tsx    料金が上がる前の確認
staffs/actions.ts・初期設定の Action・各クライアント   書き込む前の上限と料金の判定、code: 'price_increase' と acknowledgedPeak
settings/staffs/page.tsx・StaffLimitAlert.tsx    有料プランの上限の 1 行・上限に達したときの案内
データ移行（001 §5 のインポート。未実装）              v1 の上限を staff_cap に（§13.7）
規約・特商法・LP                                  §13.6
AGENTS.md                                        RPC の一覧と例外に set_staff_cap（start_trial と同じく 1 行の更新の例外）/ ActionFailure.code に 'price_increase' /
                                                 「スタッフを増やす経路を足したら」に料金の確認
```

### 13.10 実装ログ（2026-10-09）

§13 のとおりに実装した。データ移行（§13.7）は移行のインポートがまだ無いので、そのときの仕様として残す。

- **DB**: `profiles.staff_cap`（check 11〜1000）、`private.staff_limit()` の有料プランを `staff_cap` に、RPC `public.set_staff_cap(p_cap)`（`security definer`・行ロック・在籍数より下は `below active count`）。
  差分 migration `20261009044350_staff_cap.sql`（`restrict_anon_grants.sql` を追記）。pgTAP（`billing.sql`）に 12 本: 範囲外・上限まで足せて次は P0001・在籍数より下は断る・
  引き上げ・まとめて 4 人で止まる・`staff_limit()` が `staff_cap` を返す・他人の行・check・anon は 42501
- **lib**: `validation/billing`（上限の Zod と定数）、`staffCap`（`suggestedStaffCap` / `minStaffCap`）、`staffAddition`（`checkStaffAddition`: 上限 → 料金の順。
  `priceIncreaseQuote` / `raisesPrice` / `unchangedHeadroom(Message)`）、`addition`（server-only。`ensureStaffAddition`）、`entitlement`（`subscription` に `cap`。
  `isOverLimit` は有料プランで常に false）、`sync`（有効な契約を写すとき `staff_cap` が null なら `suggestedStaffCap(在籍数)` で埋める）、`limit`（`price_increase` と `set_staff_cap` の例外の日本語）
- **Action**: `createStaff` / `restoreStaff` / `completeSetup` が書き込む前に `ensureStaffAddition`。2 つ目の引数 `{ acknowledgedPeak }` でやり直す。
  `setStaffCap`、`startCheckout({ staffCap })`（Checkout の前に `set_staff_cap`）、`getUpgradeOffer({ adding })` に在籍数・割引・料金の見込みを足した
- **画面**: 申し込みの確認画面の上限の入力（`StaffCapField`）と「最大 ◯円」、「プランとお支払い」の在籍スタッフのカード（上限・メーター・「上限を変える」= `StaffCapModal`）、
  上限で止まったときのモーダル（有料は `RaiseCap`: 足そうとした人数・新しい上限・最大の月額・今の期間の見込み・人数入りのボタン）、料金が上がる追加の確認（`PriceIncreaseModal`）、
  スタッフの設定の有料プランの 1 行（`StaffLimitAlert` の `subscription`）。呼び出しは `openStaffAdditionModal(result, { adding, retry })` に寄せた
- **文言**: 規約「料金」に上限の段落、特商法の販売価格の注記、LP の料金に 1 行。「有料プランは人数の制限なし」の文言を直した。AGENTS.md（ディレクトリ・Action・RPC の一覧）

プランから変えたこと:

- **料金の確認は「人数が最大人数を超えるか」ではなく「料金のかかる人数が増えるか」で判定する**（`raisesPrice`）。人数で比べると、在籍 8 人 → 9 人のように
  無料の 10 人の範囲でも「0 円 → 0 円になります」の確認が出る（画面で確かめていて気付いた）。「あと N 人まで料金が変わらない」も最大人数と 10 人の大きいほうで数える
- `getPriceIncreaseQuote` は作らず、`getUpgradeOffer({ adding })` に料金の見込み（`priceQuote`）を足した。上限のモーダルと料金の確認のモーダルが同じ中身を読む
- 申し込みの確認画面は、上限の入力を表（特商法の最終確認）の前に置いた。決めた上限が表の「料金」の欄の「最大 ◯円」に出る

確認（ローカル。Stripe は使わず、`billing_subscriptions` に有効な行を入れて有料プランにした。スマホ幅）:

- 申し込みの確認画面: 在籍 8 人で最初の値が 15 人・「最大 500 円」
- 在籍 10 人・上限 12 人で 1 人足す → 料金の確認「0 円 → 100 円」→ 追加する → 登録。12 人目も同じく「100 円 → 200 円」
- 13 人目 → 上限のモーダル（12 人 → 13 人・新しい上限 15・最大 500 円・見込み 200 円 → 300 円）→「上限を 15 人にして 1 人を追加する」→ 確認を重ねずに登録
- 初期設定で 5 人を貼る（在籍 13 人・上限 15 人）→ 上限のモーダル 1 回（13 人 → 18 人・新しい上限 20）→ 引き上げてそのまま完成の画面
- 「プランとお支払い」: 見込み 300 円・在籍 13 人・上限 15 人・あと 2 人
- `npm run lint`（既存の警告 1 件のみ）/ `typecheck` / `test`（789）/ `npx supabase db reset` / `npx supabase test db`（227）/ `npm run build` が通る


### 13.11 実装のレビュー（2026-10-09）

直したもの:

- 初期設定の二度押し・古いタブ: `completeSetup` は店舗が完了済みなら判定を飛ばしてシフト表へ送る（以前は名前の数だけ増えるとして、完了済みなのに上限・料金のモーダルが出た）
- 在籍中のスタッフへの「復帰」（古いタブ）: 対象が退職中のときだけ判定する
- トライアル中に申し込んだ人の「プランとお支払い」の「あと N 人まで料金が変わらない」: 請求の区間が始まるまで出さない（スタッフの設定と同じ `isBillingStarted()`）。
  見込みを出せる契約かの判定は `isEstimable()` に寄せた
- `ensureStaffAddition` は契約の行を先に読まず、`getBillingOverview()` だけを読む（有料プランの往復を 1 回減らす）
- 「11 人目から」の直書きを `FREE_STAFF_LIMIT + 1` に
- 表記をシンプルに（ユーザーの希望）: 上限の入力の下は「最大 ◯円 / 月」と「請求は上限ではなく、その月の在籍スタッフの最大人数で決まります」の 2 行。
  申し込みの確認画面では「最大 ◯円」を表（特商法の最終確認）にだけ出す。料金の見込みは「この期間の見込み ◯円 → ◯円」+「◯月◯日までの請求期間。途中で人数を減らしても下がりません」（`PriceQuoteText` を 2 つのモーダルで共有）

見送ったもの: 在籍 1000 人超で同期の既定値が在籍数を下回る（現実的でない。旧料金の人はデータ移行が同期より先に入れる）/ 在籍数のクエリの重複（service_role と RLS でクライアントが分かれる。課金の規律どおり）/
スタッフ設定の履歴の読み取りが一覧の後になる（`getAuthUser()` はキャッシュされ、待つのは 1 回だけ）

確認: `lint`（既存の警告 1 件のみ）/ `typecheck` / `test`（789）/ `npx supabase db reset` / `npx supabase test db` が通る。申し込みの確認画面と上限で止まったときのモーダルをスマホ幅で見た
