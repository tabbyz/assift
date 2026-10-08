# 019: 課金（有料プラン）

- 前提: v1 分析 §4.6（プラン上限）/ 001（`profiles` の Stripe 列・移行。`plan_change_logs` の移行は本プランで取りやめる）/ 016（料金 `lib/billing/pricing`）/
  016-terms（第 8 条「料金」）/ 018-law（§6「課金の実装で守ること」）/ 017-privacy（Stripe から受け取る情報）
- 参照した v1 のコード: `app/models/{plan,user}.rb`、`app/controllers/{charges,cards,billing}_controller.rb`、`lib/tasks/stripe.rake`、
  `app/views/{charges,cards,billing}/*`、`app/views/shifts/_lock_panel`、`app/views/settings/staffs/_upper_limit`、`admin/graph_controller.rb`

> 番号: データ移行・カットオーバーより先に入れる。v1 には課金中の利用者がいるので、**カットオーバーの時点で課金が動いていないと請求が止まる**。
> 移行（001 §5）には本プランの §8 を足す。

**状態: プラン（未実装）。2026-10-07 に §11 の 1〜3・5〜14 を決定（同日に 2 を「リリース時に有料プランの人だけ」、1・3 を簡素化のため見直し、v1 の Stripe の実数で §8 を具体化）。4 はテストクロックの結果待ち。同日にプランのレビューを反映し、指摘が出なくなるまで見直した。**

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
- **期間末の請求書ができた瞬間（`invoice.created`）に最終値を送る**: 毎日の送信を期間の終わりの直前に寄せれば足りる。取りこぼすのは最後の 1 時間以内の増員だけで、誤差として受け入れる（§4.2）
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
- API キーは**制限付きキー**（Customers / Checkout Sessions / Subscriptions / Subscription Schedules / Invoices / Billing Meter Events / Billing Portal の必要な権限だけ）
- SDK は `stripe`（node）を `apiVersion` 固定（実装時の最新。少なくとも `2026-06-24.dahlia`）

### 4.2 最大人数の数え方

Meter に `max` が無いので、**最大値はアプリが計算し、Meter には「その期間のここまでの最大値」を `last` で送る**。

1. 在籍スタッフ数が変わるたびに、DB のトリガが**履歴**（`staff_count_history`: 利用者・時刻・その時点の在籍数）を 1 行足す（§5.2）
2. 請求の対象になる区間 = `[max(期間の開始, トライアルの終了), 期間の終わり)`。その区間の最大人数 = `max(区間の開始時点の人数, 区間内の履歴の人数)`。
   区間が空（期間がまるごとトライアル中）なら 0。TS の純関数 `billableStaffPeak()`（`lib/billing/peak.ts`。Vitest）
3. 送るタイミング:
   - **毎日の cron（23 時台 JST）**: 有料プランの全員について、今の期間のここまでの最大人数を `timestamp = min(今, 期間の終わり − 1 分)` で送る
     （v1 から引き継ぐ契約は期間の終わりが 23:59:59 JST なので、23 時台の終わりに走ったときに次の期間へはみ出さないようにする）。
     期間の最終日の送信がそのまま請求に効く（期間の終わり = 1 日 0:00 JST より前に届く）。
     最終日の送信より後（最後の 1 時間以内）に増やした人数は、その期間の請求には載らない。誤差として受け入れ、設計の単純さを取る（決定。§11-8）。
     ただし次の期間は「開始時点の人数」に入るので、取りこぼすのは「その期間に 1 時間足らず在籍した人の、その期間 1 か月分」だけになる
   - 申し込み直後（同期のとき）と退会のとき（§5.8）に 1 回（時刻は同じく `min(今, 期間の終わり − 1 分)`）
4. `identifier = <subscription id>:<期間の開始>:<人数>`。同じ値の二重送信を Stripe が捨てる（一意性は 24 時間以上。`last` なので重複しても請求は変わらない）
5. 同じ顧客への同時送信は 1 本まで（429）。cron は利用者をまたいでは並行に、1 人の中では順に送り（§5.7）、429 は待って再試行する
6. 毎回、履歴から期間の始めからの最大人数を計算し直して送るので、cron が途中の 1 日落ちても翌日の送信で追いつく。期間の最終日に落ちたときだけ、
   最終日（と前日の送信の後）の増員が載らない（利用者に有利な側に倒れる）

履歴方式にした理由: 期間を「JST の暦月」に決め打ちしないので、v1 から引き継ぐ Subscription（請求期間が月末 23:59:59 JST 始まり）でも、
トライアルが期間の途中で終わる場合でも、同じ関数で数えられる。在籍数の変化は 1 店舗で月に数回なので、行は増えない。

### 4.3 請求日

- 新しい Subscription は Checkout で `billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 }`（UTC）。
  **毎月末日 15:00 UTC = 翌月 1 日 0:00 JST** に期間が切り替わる（短い月は月末に寄る）。請求書は既定の猶予（1 時間）の後に確定してカードに請求する
- トライアルは Stripe に持たせないので（§7）、anchor と併用できない制約に当たらない
- 申し込んだ月の残り（申し込み〜月末）: 規約どおり「その月の最大人数」で請求する方針。`proration_behavior` の既定で初回の端数期間の従量分が
  1 日の請求書に載ることを**テストクロックで確かめる**（§9.3-1）。載らなければ `proration_behavior` と文言を見直す（§11-4）
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

- `GET`。`Authorization: Bearer ${CRON_SECRET}` が無ければ 401。Vercel Cron で毎日 1 回、**23 時台 JST**（`0 14 * * *`。`vercel.json`）。
  Hobby は指定した 1 時間のどこかで走る（日 1 回は可）。Pro なら `50 14 * * *` にして取りこぼしを 10 分に縮める
- 対象は数百件（旧料金だけで 392 件）。1 人ずつ同期して送ると Stripe への呼び出しが 1 日 800 回前後になり、関数の実行時間の上限に掛かりうるので、
  - **同期は一覧でまとめて取る**: `subscriptions.list`（`assift_monthly` と旧 `freemium-monthly` の price で絞り、100 件ずつのページ）で状態と期間を取り、`billing_subscriptions` に写す（Webhook が落ちていた日の保険）。
    既定の一覧には解約済みが出ないので、**`billing_subscriptions` で有効扱いなのに一覧に出てこない行は個別に取り直す**（解約の Webhook を落とすと、上限なしのまま残ってしまうため）
  - **送信は利用者をまたいで並行**（並行数 10 程度）。同じ利用者への同時送信は 1 本まで（§4.2）なので、1 人の中は順に送る。429 は待って再試行する
  - ルートに `maxDuration` を指定する。件数が増えて収まらなくなったら、ページごとに分けて続きから実行できる形にする
- 1 人ずつ try/catch してログに出し、全体は止めない
- **見張り**: 旧 `freemium-monthly` の price のまま schedule が付いていない有効な契約を見つけたらログに出す（起きないはずの状態。利用量が送られず無料になってしまう）

### 5.8 退会

即時解約は従量分が捨てられ、猶予中の送信も載らない（§3）。そこで退会では**期間末の解約**にする。

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
| トライアル中に申し込む | できる。**トライアルの終わりまでは請求しない**（§4.2 の区間がトライアルの終わりから始まる） | 「今のうちにカードを登録しておく」を損なく選べる。終了日にロックされる人を減らす |
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
| 上限 11 人以上・`unpaid`・90 日以内に編集あり | 47 | **有効に戻してから、上と同じく旧料金に移す**（決定。§11-10）: 溜まった下書きを無効にし、最後に失敗した請求書を「回収不能」にする（Stripe の案内どおり、これで `active` に戻る。過去分は請求しない。§11-12）。そのあと上の行と同じ schedule を付ける。**次の請求（今の期間の終わり）は期限切れのカードで失敗し、通常の支払い失敗の流れ**（Stripe の支払い失敗メール・リトライ・アプリの帯。§5.4）に乗る。カードを更新すれば旧料金のまま続き、更新しなければリトライが尽きた時点で解約（§8.3 で切り替える設定）→ 10 人を超えていればロック |
| 上限 11 人以上・`unpaid`・それ以外（編集なし・90 日より前） | 87 | 即時解約。溜まった下書きは無効にする（§11-13） |
| 上限 10 人（0 円）・すべての状態 | 約 502 | 即時解約（請求は 0 円）。利用者は新料金の無料プランになる。未払いの分の下書きも無効にする |

- 下書きの無効化: サブスクリプションの下書きは削除できず、無効にできるのは確定した請求書だけ。`auto_advance: false` にしてから確定し（請求は走らない）、
  すぐ無効にする。テストモードで、確定の時点でメールや請求が走らないことを確かめる
- 「回収不能」で `unpaid` から `active` に戻ることは、テストモードで確かめる（状態の判定が「最新の請求書だけを見る」設定のときの動き。§9.3）
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
- 上限で止まることが無くなるので、人数を増やすとその月から料金が変わる
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
| 4 | 申し込んだ月の残りの期間 | テストクロックの結果に合わせる（§4.3）。方針は「申し込んだ日からのその月の最大人数で請求」 |
| 5 | 無料で 10 人を超えたとき | **決定**: シフト表をロック（共有・エクスポートは止めない） |
| 6 | `plan_change_logs` | **決定**: 移行せず、表ごと消す。元のデータは v1 のダンプに残す（§5.2・§8.1） |
| 7 | 旧料金の利用者が解約したあと | **決定**: 解約で旧料金は終わり、再び申し込むと新料金（クーポンが Subscription と一緒に終わる）。解約の手前の画面と告知で知らせる（§2.4） |
| 8 | 期間末の最終送信 | **決定**: `invoice.created` での送信をやめ、毎日 23 時台 JST の送信で済ませる。最後の 1 時間以内の増員は誤差（§4.2） |
| 9 | 旧料金のクーポンの期間 | **決定**: 無期限。やめるときは告知してから外す（§8.5） |
| 10 | v1 で支払いが止まっている（`unpaid`）人 | **決定**: 90 日以内に使っている 47 件は救う。有効に戻して旧料金に移し、次の請求から通常の支払い失敗の流れに乗せる（§8.2.2） |
| 11 | 移行の進め方 | **決定**: 切り替え待ちの間の解約はアプリの画面で受ける / カットオーバーは月の下旬 / スクリプトは dry-run → 数件 → 残り（§8.2.3・§8.3） |
| 12 | 溜まった下書きの請求書 | **決定**: すべて無効にし、過去分は請求しない |
| 13 | 使っていない `unpaid`（87 件） | **決定**: カットオーバーで解約 |
| 14 | リトライが尽きたときの Stripe の設定 | **決定**: カットオーバーで「未払いにする」から「解約する」に変える |

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
