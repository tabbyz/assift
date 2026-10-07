# 019: 課金（有料プラン）

- 前提: v1 分析 §4.6（プラン上限）/ 001（`profiles` の Stripe 列・移行。`plan_change_logs` の移行は本プランで取りやめる）/ 016（料金 `lib/billing/pricing`）/
  016-terms（第 8 条「料金」）/ 018-law（§6「課金の実装で守ること」）/ 017-privacy（Stripe から受け取る情報）
- 参照した v1 のコード: `app/models/{plan,user}.rb`、`app/controllers/{charges,cards,billing}_controller.rb`、`lib/tasks/stripe.rake`、
  `app/views/{charges,cards,billing}/*`、`app/views/shifts/_lock_panel`、`app/views/settings/staffs/_upper_limit`、`admin/graph_controller.rb`

> 番号: データ移行・カットオーバーより先に入れる。v1 には課金中の利用者がいるので、**カットオーバーの時点で課金が動いていないと請求が止まる**。
> 移行（001 §5）には本プランの §8 を足す。

**状態: プラン（未実装）。2026-10-07 に §11 の 1〜3・5〜9 を決定（同日に 2 を「リリース時に有料プランの人だけ」、1・3 を簡素化のため見直し）。4 はテストクロックの結果待ち。**

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
| Dashboard の設定 | 確定の猶予は既定（1 時間）のまま / リトライが尽きたら**解約** / メール: 領収書・支払い失敗・3DS の認証リンク・カードの期限切れ | |

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
   - **毎日の cron（23 時台 JST）**: 有料プランの全員について、今の期間のここまでの最大人数を `timestamp = 今` で送る。
     期間の最終日の送信がそのまま請求に効く（期間の終わり = 1 日 0:00 JST より前に届く）。
     最終日の送信より後（最後の 1 時間以内）に増やした人数は請求に載らない。誤差として受け入れ、設計の単純さを取る（決定。§11-8）
   - 申し込み直後（同期のとき）と退会のとき（§5.8）に 1 回
4. `identifier = <subscription id>:<期間の開始>:<人数>`。同じ値の二重送信を Stripe が捨てる（一意性は 24 時間以上。`last` なので重複しても請求は変わらない）
5. 同じ顧客への同時送信は 1 本まで（429）。cron は 1 人ずつ順に送り、429 は待って再試行する
6. cron が 1 日落ちても、前日までに送った値が残る（その日の増員だけが載らない）。最終日に落ちたときだけ請求が少なくなる（利用者に有利な側に倒れる）

履歴方式にした理由: 期間を「JST の暦月」に決め打ちしないので、v1 から引き継ぐ Subscription（請求期間が月末 23:59:59 JST 始まり）でも、
トライアルが期間の途中で終わる場合でも、同じ関数で数えられる。在籍数の変化は 1 店舗で月に数回なので、行は増えない。

### 4.3 請求日

- 新しい Subscription は Checkout で `billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 }`（UTC）。
  **毎月末日 15:00 UTC = 翌月 1 日 0:00 JST** に期間が切り替わる（短い月は月末に寄る）。請求書は既定の猶予（1 時間）の後に確定してカードに請求する
- トライアルは Stripe に持たせないので（§7）、anchor と併用できない制約に当たらない
- 申し込んだ月の残り（申し込み〜月末）: 規約どおり「その月の最大人数」で請求する方針。`proration_behavior` の既定で初回の端数期間の従量分が
  1 日の請求書に載ることを**テストクロックで確かめる**（§9.3-1）。載らなければ `proration_behavior` と文言を見直す（§11-4）
- v1 から引き継ぐ Subscription は請求日を動かさない（§8.2）

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
  price_lookup_key       text,                          -- assift_monthly / 旧 freemium-monthly
  discount_percent       smallint,                      -- 旧料金のクーポン（50）。null = なし（§2.4）
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
- `profiles` に `authenticated` の UPDATE は付けない。トライアルの開始は RPC `start_trial()`（`security definer`、`trial_end is null` のときだけ、
  期間は始めた日から 2 か月後の月末まで。`auth.uid()` の行だけ）
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
- `auth.uid()` が null（移行スクリプト・service_role）のときは止めない
- 同じトリガ関数の AFTER 版が `staff_count_history` に 1 行足す（前の行と同じ数なら足さない）。店舗の削除（cascade）も拾う
- 止めたときの表示: `createStaff` / 復帰 / 初期設定の Action が上の message を見て `{ ok: false, code: 'staff_limit' }` を返し、
  クライアントが**トライアルの案内**（まだ使っていなければ）または**申し込みの案内**のモーダルを開く（§5.4）

### 5.4 画面

URL は**利用者単位**（全店舗の合計で数えるので店舗の外）。`(protected)/account/billing/` に置く。

| 画面 | 中身 |
| --- | --- |
| 11 人目で止まったとき（モーダル） | トライアル未使用: 「10 人を超えるスタッフは有料プランで使えます。**◯月◯日まで無料で、人数の制限なく試せます**（カードの登録は要りません）」→「無料で試す」（`start_trial` → そのまま元の操作をやり直す）/「料金を見る」。使用済み: 「有料プランに申し込むと 11 人目から追加できます」→ 申し込みへ |
| `/account/billing`「プランとお支払い」 | 今のプラン（無料 / トライアル中（◯月◯日まで）/ 有料 / 有料（旧料金: 11 人目から 1 人 50 円。`discount_percent` で判定）/ 個別契約）、**いまの在籍数・今月の最大人数・今月の料金の見込み**（`monthlyPriceYen`）、状態の注意（解約予定・支払い失敗）、ボタン「有料プランに申し込む」または「お支払い方法・請求書・解約」（ポータル）。旧料金の人はポータルへ進む前に「解約すると旧料金には戻れません」を出す |
| `/account/billing/subscribe`「お申し込み内容の確認」 | 特商法 12 条の 6 の最終確認（018 §6）: 料金（人数で変わること・料金表・いまの人数での見込み）、支払い時期（毎月末締め・翌月 1 日に請求）、提供時期（すぐ）、契約期間（1 か月ごと自動更新）、解約（いつでも。その月の末日まで使え、日割りなし）、返金なし、規約・特商法へのリンク。トライアル中なら「トライアルの終わる ◯月◯日までは請求しません」。ボタン「カード情報の入力へ」 |
| トライアル中の帯 | 店舗の画面の上に「無料トライアル中: あと N 日（◯月◯日まで）。続けて使うには有料プランへ」+ 申し込みへのリンク。残り 7 日からは色を変える |
| アカウント画面 | 「プランとお支払い」へのリンク。退会の確認に「有料プランは解約され、今月分を請求します」を足す |
| スタッフの設定 | 無料プランで 10 人に達したら `Alert`（v1 の `_upper_limit`）「無料プランは在籍 10 人までです」+ トライアル / 申し込みへのリンク。追加ボタンは押せるまま（押したら上のモーダル） |
| 初期設定のスタッフ | 貼った名前が残りの枠を超えたら、保存の前に同じモーダル |
| シフト表 | **無料プランなのに在籍が 10 人を超えている**（トライアル終了・解約・支払い失敗の後）とき、v1 の lock panel と同じく表の上に重ねる: 「無料プランの上限（10 人）を超えています。有料プランに申し込むか、スタッフを退職にしてください」+ 2 つのボタン。共有ページ・エクスポートは止めない（決定） |
| ヘッダー | 出さない（v1 の `_plan_status` は設定メニューにあったが、v2 は課金の画面に寄せる） |

- 文言の数字は `lib/billing/pricing` から引く（`monthlyPriceYen(count, discountPercent)`。割引は Stripe と同じく小計に掛けて 1 円未満を切り捨てる）。トライアルの日付は `lib/billing/trial.ts`
- Checkout から戻ったら `/account/billing?checkout=success` で同期（§5.6）してから描画し、通知「有料プランのお申し込みが完了しました」

### 5.5 Server Action（`account/billing/actions.ts`）

| Action | 内容 |
| --- | --- |
| `startTrial()` | `requireUser()` → RPC `start_trial()`。使用済みなら fail。`revalidatePath('/tenants', 'layout')` |
| `startCheckout()` | `requireUser()` → 同期して**既に有料なら fail**（二重契約を防ぐ）→ Customer が無ければ作る（`email`、`preferred_locales: ['ja']`、`metadata.user_id`）→ `profiles.stripe_customer_id` を保存（service_role）→ Checkout Session（`mode: subscription`、`price` = `assift_monthly`、クーポンなし（`allow_promotion_codes` も付けない）、`payment_method_types: ['card']`、`locale: 'ja'`、`client_reference_id`、§4.3 の anchor、`success_url` / `cancel_url`、`expires_at` 30 分）→ `{ redirectTo: session.url }` |
| `openPortal()` | ポータルの Session を作って `{ redirectTo }`。`has_schedule` の間は呼ばず、画面に「解約はお問い合わせください」（§8.2） |

- 認証系と同じく `redirect()` せず `{ redirectTo }` を返し、クライアントが `window.location.assign`（外部 URL）
- それでも同じ Customer に有効な Subscription が 2 件できたら、同期関数が新しいほうを残して古いほうを解約し、ログに出す
  （Meter は Customer 単位で集計するので、2 件あると二重請求になる）

### 5.6 Webhook と同期（`src/app/api/stripe/webhook/route.ts`、`lib/billing/sync.ts`）

- `POST` だけ。`await request.text()` の生 body と `stripe-signature` で `constructEventAsync`。失敗は 400
- 受けるイベント: `checkout.session.completed` / `customer.subscription.{created,updated,deleted}` / `invoice.paid` / `invoice.payment_failed`
- どれも**中身を使わず** `syncCustomer(customerId)` を呼ぶだけ。同期関数は Stripe から Customer の Subscription を取り直し、
  `billing_subscriptions` を upsert / delete する（順不同・重複に強い。冪等）。クーポンの有無（`discount_percent`）もここで写す
- Customer → 利用者は `profiles.stripe_customer_id` で引く（無ければ `metadata.user_id`）。利用者が居なければ（退会済み）何もしない
- 書き込みは `createPrivilegedClient()`。中のクエリはすべて `.eq('user_id', …)` / `.eq('id', …)` で 1 人に絞る（`publicShare.ts` と同じ規律）
- **preview には Webhook が届かない**（PR ごとの URL・Deployment Protection・PR ごとのブランチ DB）。Webhook に頼らず動くよう、
  `/account/billing` の描画時（`synced_at` が古いとき）と Checkout から戻ったときにも `syncCustomer` を呼ぶ。
  preview で確かめられないのは「解約・支払い失敗が自動で反映されること」だけ（ローカルは Stripe CLI の `stripe listen` で確かめる）

### 5.7 cron（`src/app/api/cron/billing-usage/route.ts`）

- `GET`。`Authorization: Bearer ${CRON_SECRET}` が無ければ 401。Vercel Cron で毎日 1 回、**23 時台 JST**（`0 14 * * *`。`vercel.json`）。
  Hobby は指定した 1 時間のどこかで走る（日 1 回は可）。Pro なら `50 14 * * *` にして取りこぼしを 10 分に縮める
- 有料プランの全員について §4.2 の送信。1 人ずつ try/catch してログに出し、全体は止めない
- 送信の前に `syncCustomer` で期間を最新にする（Webhook が落ちていた日の保険）

### 5.8 退会

即時解約は従量分が捨てられ、猶予中の送信も載らない（§3）。そこで退会では**期間末の解約**にする。

1. 有料プランなら、今の期間の最大人数を `timestamp = now` で送る（以降は履歴が消えるので、これがその期間の最後の値になる）
2. `cancel_at_period_end: true`（schedule が付いていれば先に release）
3. `auth.admin.deleteUser`

期間末に Stripe が通常の請求書（1 で送った人数）を出して Subscription が終わる。Customer は消さない（請求書を残す）。
Stripe が失敗したら退会も止める（請求できないまま消さない）。退会の確認ダイアログに「今月分（◯人・◯円の見込み）は月末に請求します」と出す。

### 5.9 AGENTS.md に足すこと

- `createPrivilegedClient()` の用途に「Stripe の Webhook / cron / 申し込みで `profiles.stripe_customer_id` を書くとき」（`lib/billing/` に閉じる）
- `src/app/api/` は「ファイルを返す GET だけ」→ Webhook（POST）と cron（GET）を足し、それぞれの認証（署名 / `CRON_SECRET`）を書く
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
- pgTAP: 無料で 11 人目の INSERT / 復帰が P0001、トライアル中・有料・個別契約なら通る、他人の店舗のスタッフ数は数えない、service_role は止めない、
  履歴が増減で 1 行ずつ増え、同じ数では増えない、`start_trial` は 1 回だけ・他人の行は変えない・anon は 42501、2 表の RLS

---

## 7. トライアル（決定）

### 7.1 方針

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| カード | **不要** | 「試すだけのつもりが課金されていた」を構造的に起こさない（苦情・チャージバック・特商法の定期購入の論点が無い）。終了時に止まるのは**ロック**なので、カードが無くても決断の瞬間は来る |
| 人数 | **無制限** | 20 人の店舗が実際の人数で運用できないと、試したことにならない |
| 始まる時点 | **11 人目で止まったとき**（モーダルの「無料で試す」）。登録時ではない | 10 人以下の店舗は無料で足りるので、トライアルを無駄に消費しない。必要になった瞬間から数える |
| 長さ | **始めた日から 2 か月後の月末まで**（61〜92 日。v1 と同じ）。全員同じ。v1 で使った人（`trial_end` が埋まっている）は対象外 | v1 で約束していた長さを変えない（v1 の利用者に不利な変更にしない）。全員そろえれば、v1 から来た人かを見分ける列と分岐が要らない。シフト表は月単位なので、月末で終わればいつでも「次の月のシフトを作り終えたところで終わる」決断の瞬間になる（10/10 に始めると 12/31 まで。1 月のシフトを作り終えた直後） |
| 回数 | 1 アカウント 1 回（`trial_end is null` のときだけ始められる） | |
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
| `stripe_subscription_id` | 入れない。移行の後に `syncCustomer` を全員に回して `billing_subscriptions` を作る |
| 在籍スタッフ数 | 全員に `staff_count_history` を 1 行（移行時点の数） |

移行の検証に足す: 無料扱いなのに在籍が 10 人を超える利用者の数（v1 の `over_limit?`。v2 では lock panel が出る）。多ければカットオーバーの前に連絡する。

### 8.2 Stripe の Subscription（`scripts/stripe/migrate-v1-subscriptions.ts`）

price が旧 `freemium-monthly` で、`active` / `trialing` / `past_due` の Subscription を列挙し、dry-run で一覧（利用者・上限・期間・状態・既存の schedule）を出してから apply する。

| v1 の状態 | 扱い |
| --- | --- |
| 上限 11 人以上 | subscription schedule（`from_subscription`。既にあれば更新）で、**今の期間の終わり**に price を `assift_monthly`（Meter）へ切り替え、**同時に旧料金のクーポンを付ける**。phase 0 は今の price・期間・`trial_end` をそのまま、phase 1 は `items: [{ price: assift_monthly }]`・`discounts: [{ coupon: assift_v1_legacy }]`、`end_behavior: release`。今の期間は v1 が送った上限（usage records の max）で請求される |
| 上限 10 人（0 円） | 即時解約（請求は 0 円）。利用者は新料金の無料プランになる |
| トライアル中 | 上の 2 つと同じ。phase 0 に `trial_end` を引き継ぐ |

- **schedule の作成・更新は API `2025-02-24.acacia` を指定する**（basil 以降は meter の無い metered price を扱えない。移行ガイド）。
  stripe-node はリクエストごとに `apiVersion` を上書きできるので、このスクリプトの schedule の呼び出しだけ acacia にする
- v1 の Subscription は `classic` のまま。請求日もそのまま（月末 23:59:59 JST 前後。v1 から変えない）
- schedule が付いている間（カットオーバーから最初の期間の終わりまで）は**ポータルで解約できない**。`billing_subscriptions.has_schedule` を立て、
  画面では「解約はお問い合わせください」にして手で対応する（schedule を release してから `cancel_at_period_end`）。切り替わった後は release されて通常に戻る
- 切り替えの請求書（phase の切り替え）にも猶予中の利用量が載る（§3）ので、新しい price の最初の期間からは §4.2 の送信がそのまま効く
- カットオーバーで v1 の rake（Heroku Scheduler の `stripe:create_usage_record`）を止める。切り替えまでの残りの期間は、v1 が最後に送った上限で請求される
  （上限を超えて v2 で足したスタッフは、その期間は請求されない。利用者に有利なので許容）

### 8.3 順序

1. （事前）live で `scripts/stripe/setup.ts`、Webhook の登録、Dashboard の設定（§4.1）
2. カットオーバー: v1 停止 → データ移行（§8.1）→ `migrate-v1-subscriptions --apply` → 全員の `syncCustomer` → v1 の rake を止める
3. 切り替え後の最初の請求日: 旧料金の利用者の請求書を Dashboard で突き合わせる（クーポンが効いて 1 人 50 円。v1 の上限での料金 ≥ v2 の請求になっているはず）

### 8.4 告知（カットオーバーの告知に含める。016-terms §5 の 548 条の 4 の周知と一緒に）

旧料金の利用者（有料プランを契約中の人）へ:

- 料金はそのまま（11 人目から 1 人 50 円）。請求書には「新料金（1 人 100 円）から旧料金の割引 50%」と出る。上限を 5 人単位で選ぶ仕組みは無くなり、**その月の在籍スタッフの最大人数**で請求する（同じ人数なら今より高くならない）
- 上限で止まることが無くなるので、人数を増やすとその月から料金が変わる
- 請求書・カードの変更・解約は「プランとお支払い」から（Stripe の画面）。切り替えの月だけは解約をお問い合わせで受ける
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

- `stripe listen --forward-to localhost:3000/api/stripe/webhook` の出す secret を `.env.local` に。クラウドのセッションで Stripe CLI が使えなければ、
  Webhook の確認はローカルの PC で行い、ここでは同期関数（ページ描画時）で確かめる
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

---

## 12. 実装ログ

（実装後に追記する）
