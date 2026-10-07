# 019: 課金（有料プラン）

- 前提: v1 分析 §4.6（プラン上限）/ 001（`profiles` の Stripe 列・`plan_change_logs`・移行）/ 016（料金 `lib/billing/pricing`）/
  016-terms（第 8 条「料金」）/ 018-law（§6「課金の実装で守ること」）/ 017-privacy（Stripe から受け取る情報）
- 参照した v1 のコード: `app/models/{plan,user}.rb`、`app/controllers/{charges,cards,billing}_controller.rb`、`lib/tasks/stripe.rake`、
  `app/views/{charges,cards,billing}/*`、`app/views/shifts/_lock_panel`、`app/views/settings/staffs/_upper_limit`、`admin/graph_controller.rb`

> 番号: データ移行・カットオーバーより先に入れる。v1 には課金中の利用者がいるので、**カットオーバーの時点で課金が動いていないと請求が止まる**。
> 移行（001 §5）には本プランの §8 を足す。

**状態: プラン（未実装。2026-10-07）。§11 の「未確定」はユーザーの判断待ち。**

---

## 1. 目的と完了条件

### 目的

- 在籍スタッフが 10 人を超える店舗が、カードで有料プランに申し込める（11 人目から 1 人 100 円／月。016）
- 有料プランの請求は規約第 8 条どおり: **月末締め、その月の在籍スタッフ（全店舗の合計）の最大人数**。月の途中で解約しても日割りにしない
- **v1 の利用者は v1 の料金（11 人目から 1 人 50 円）をこれからも使える**（§2.3）
- v1 の Stripe サブスクリプションを、請求を止めず・二重にせず v2 に引き継ぐ

### 完了条件

- [ ] 無料プランで 11 人目の在籍スタッフを作れない（追加・復帰・初期設定のまとめて追加のどれでも）。**DB で止める**（§5.3）
- [ ] 申し込みの前に、特商法 12 条の 6 の最終確認画面を出す（018 §6）
- [ ] Stripe Checkout でカードを登録すると有料プランになり、上限が外れる
- [ ] 月内の最大人数が Stripe に届き、翌月 1 日の請求書がその人数の料金になる（テストクロックで確認。§9.3）
- [ ] カードの変更・請求書の確認・解約を Stripe のカスタマーポータルでできる
- [ ] 支払いに失敗し続けると有料プランが終わり、10 人を超えていればシフト表がロックされる（v1 の lock panel）
- [ ] 退会すると有料プランが解約され、その月の分が請求される
- [ ] v1 の利用者（`profiles.pricing = 'v1'`）は 1 人 50 円で請求される
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
| トライアル | 初回申し込みから **2 か月後の月末まで無料**（`TRIAL_MONTH = 2`。`trial_end` が Subscription の `trial_end`） |
| 請求日 | トライアル終了（月末 23:59:59 JST）が anchor。画面の説明は「毎月 1 日に自動更新」 |
| 解約 | 画面なし。上限を 10 人に戻すと 0 円になる。退会時に Subscription を cancel |
| 履歴 | `usage_records`（上限の変更履歴）。`invoices` は未使用 |
| 個別契約 | Subscription なしで `max_staffs_count` だけ上げた利用者（振込の大口 1 社。018 §7） |
| Webhook | なし（支払い失敗を知る手段がない） |

### 2.2 v2 で決まっていること（016 / 016-terms / 018）

- 10 人まで無料、11 人目から 1 人 100 円／月（税込）。**数えるのは実際の在籍スタッフ**（上限を選ばせない）
- 月末締め、その月の最大人数。解約は月の途中でも日割りなし、翌月から無料。支払いはカードだけ
- 有料プランは**申し込んだときだけ**料金がかかる（規約第 8 条）

### 2.3 落とし所（推奨）

| 論点 | v1 | v2（推奨） | 理由 |
| --- | --- | --- | --- |
| 課金の単位 | 上限人数（5 人単位で選ぶ） | **月内の最大在籍人数**（1 人単位。選ばせない） | 決定済み（016-terms）。人数を先に決める手間と「上限に当たって追加できない」が無くなる |
| 無料プランの上限 | `max_staffs_count`（既定 10） | **10 人で止める**。有料プランは上限なし | 「申し込んだときだけ料金」（規約）を守るには、無料のまま 11 人目を作れてはいけない |
| v1 の利用者の料金 | 1 人 50 円（5 人単位） | **1 人 50 円（1 人単位）を据え置く**。仕組みは v2 にそろえる | 同じ人数なら v1 より高くならない（5 人単位の切り上げが無くなるぶん安いか同じ）。仕組みを 1 本にできる（§2.4） |
| トライアル | 初回 2 か月 | 新規: **なし**（10 人までの無料が試用を兼ねる）／ v1 の利用者: 初回の申し込みに v1 と同じトライアル | v1 の「既存のプラン」に含まれていた条件なので残す。§11-3 |
| 申し込み | 自前の画面 + Elements | **最終確認画面（自前）→ Stripe Checkout** | カード番号・3DS・JCB 対応を Stripe に任せる。特商法の表示は Checkout の前の画面で行う（018 §6） |
| カード変更・請求書・解約 | カード変更だけ自前 | **カスタマーポータル** | 自前で持つ画面を減らす。従量課金のサブスクリプションはポータルで「変更」はできないが「解約」はできる（変更は不要） |
| 利用量の送信 | 毎日 rake で上限を送る | 月内の最大人数を **Billing Meter（集計 `last`）** に送る（§4） | 旧 metered（usage records）は API `2025-03-31.basil` で廃止。Meter に `max` は無い |
| 状態の把握 | Stripe に毎回問い合わせ | **Webhook + 同期関数**で DB にキャッシュ | 支払い失敗・解約を知るため。画面描画のたびに Stripe を呼ばない |
| 請求日 | anchor = トライアル終了 | **毎月 1 日 0:00 JST**（`billing_cycle_anchor_config`） | 「月末締め」と請求期間を一致させる（§4.3） |

### 2.4 「既存のプランを使える」の範囲（推奨）

v1 の「プラン」= 料金表（10 人無料・1 人 50 円）+ 初回トライアル、と捉える。上限人数を選ぶ仕組みは v2 で無くなるので、v1 の利用者にも適用しない。

- **対象: v1 から移行した全ユーザー**（課金中かどうかを問わない）。移行で `profiles.pricing = 'v1'`。v2 で登録した人は `'v2'`
- 一度 `'v1'` になった利用者は、解約して再び申し込んでも `'v1'` のまま
- 上限を選ぶ仕組みを外すのは**利用者に不利ではない**（同じ人数なら同額以下）。ただし「上限で止まっていた追加が止まらなくなる」ので、
  カットオーバーの告知で知らせる（§8.4）
- v1 の上限を 10 人に戻していた（0 円の）Subscription は引き継がず、解約して無料プランにする（§8.2）

代案（不採用）: v1 の利用者だけ「5 人単位の上限を選ぶ」画面を v2 にも作る。v1 と完全に同じになるが、上限の UI・Stripe の送信・
画面の分岐が 2 系統になる。料金が同じか安くなる推奨案で「既存のプランを使える」を満たせると判断した。§11-1 で確認する。

---

## 3. 調査（2026-10 時点）

| 項目 | 内容 | 出典 |
| --- | --- | --- |
| 旧 usage records の廃止 | API `2025-03-31.basil` で usage records API を削除。meter の無い metered price は作れない。使い続けるには `2025-02-24.acacia` 以前の API を指定する必要がある | [Stripe changelog](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing) / [移行ガイド](https://docs.stripe.com/billing/subscriptions/usage-based-legacy/migration-guide) |
| Meter の集計 | `sum` / `count` / `last`（basil で追加）。**`max` は無い**。`last` は期間内で最新のイベントの値（「最大値を自前で計算して送る」用途が想定されている） | [last の追加](https://docs.stripe.com/changelog/basil/2025-03-31/meters-last-agg-formula) / [Meter の設定](https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure) |
| イベントの時刻 | 過去 35 日〜未来 5 分まで。期間内にイベントが無ければ 0 | [Meter Events](https://docs.stripe.com/api/billing/meter-event) |
| 請求書の確定の猶予 | 既定 1 時間。その間は前の期間の利用量を送れる。**最大 72 時間**まで延ばせる（Dashboard の請求書設定） | [猶予の設定](https://docs.stripe.com/billing/subscriptions/usage-based/configure-grace-period) |
| 旧 metered からの移行 | Meter と新しい price を作り、期間の境目で切り替える（subscription schedule）。並行して送って突き合わせるのが安全 | 移行ガイド（同上） |
| billing mode | 新しい Subscription は既定で `flexible`。flexible は旧 usage-based と非互換（v1 の Subscription は `classic` のまま） | [billing mode](https://docs.stripe.com/billing/subscriptions/billing-mode) |
| 請求日の固定 | `billing_cycle_anchor_config`（`day_of_month` + `hour` など。**UTC**）。`day_of_month: 31` は短い月は月末。**Checkout でも `2026-06-24.dahlia` から使える**。トライアルとは併用不可 | [Checkout の請求日](https://docs.stripe.com/payments/checkout/billing-cycle) / [dahlia changelog](https://docs.stripe.com/changelog/dahlia/2026-06-24/checkout-sessions-billing-cycle-anchor-config) |
| Checkout と従量課金 | metered price は quantity を渡さない。flexible では初回の請求書に metered の明細が載らない（前払いなし） | [Checkout のサブスクリプション](https://docs.stripe.com/payments/subscriptions) |
| カスタマーポータル | 従量課金のサブスクリプションは**解約はできるが変更はできない**。カード変更・請求書の履歴・宛名の編集は可 | [カスタマーポータル](https://docs.stripe.com/customer-management) |
| 最新の API | `2026-06-24.dahlia`（stripe-node 22.3.0） | [stripe-node のリリース](https://newreleases.io/project/npm/stripe/release/22.3.0) |
| 3D セキュア | 2025-03 末から EC 加盟店は EMV 3-D セキュアが原則義務。継続課金は初回（利用者の操作）で認証し、以降は加盟店起点（MIT）として扱われる。発行会社が認証を求めたら Stripe がメールで認証リンクを送れる | [ネットショップ担当者フォーラム](https://netshop.impress.co.jp/node/12342) / [Adyen の解説](https://www.adyen.com/ja_JP/knowledge-hub/3ds-mandate-in-japan-what-you-need-to-know-2025) |
| Webhook の定石 | 生の body で署名を検証。イベントは**順不同・重複あり**なので、イベントの中身で状態を組み立てず、**Stripe から最新を取り直して DB に写す**同期関数を 1 本にする。決済後のリダイレクトだけに頼らない | [Next.js + Supabase + Stripe の整理](https://dev.to/gaper-ai/architecting-a-clean-nextjs-supabase-and-stripe-saas-stack-32eh) / [Supabase との同期](https://www.iloveblogs.blog/post/nextjs-supabase-stripe-subscriptions-guide) |

docs.stripe.com はこの環境から直接開けなかった（検索結果の要約で確認）。実装の最初に §9.3 のテストクロックで挙動を確かめ、
食い違えば本プランを直す。

検討して採らなかったもの:

- **Supabase の Stripe Sync Engine**（Stripe の全オブジェクトを `stripe` スキーマへ写す）: 必要なのは 1 人 1 件のサブスクリプションの状態だけ。テーブルと権限が大きく増える
- **数量（licensed）の per-seat price**: 前払いになり、月の途中の増減で比例配分の請求書が出る。「月末締め・最大人数」と合わない
- **`invoice.created` で金額を invoice item として足す**: Stripe 側に料金表が無くなり、請求書の明細が「11 人目以降 N 人 × 100 円」にならない

---

## 4. Stripe の構成

### 4.1 オブジェクト

| オブジェクト | 値 | 備考 |
| --- | --- | --- |
| Product | `assift`（v1 のものを使い回す） | live は既存。test は作る |
| Meter | `event_name: active_staffs`、`default_aggregation.formula: last`、`customer_mapping: payload.stripe_customer_id`、`value_settings.event_payload_key: value` | v2 / v1 の両方の price が使う |
| Price（v2） | `lookup_key: assift_monthly_v2`、jpy、`recurring: { interval: month, usage_type: metered, meter }`、graduated tiers `[{ up_to: 10, unit_amount: 0 }, { up_to: inf, unit_amount: 100 }]` | 数字は `lib/billing/pricing` と一致させる（§6 のテスト） |
| Price（v1） | `lookup_key: assift_monthly_v1`、同上で `unit_amount: 50` | |
| Portal 設定 | 請求書の履歴・支払い方法の更新・宛名（name）の編集・**期間の終わりに解約**。プランの変更はオフ | `locale` は Customer の `preferred_locales: ['ja']` |
| Webhook | `/api/stripe/webhook`。本番と（あれば）ステージングだけ | preview は URL が PR ごとで Deployment Protection もある。§5.6 |

- price の id は環境変数に持たず **`lookup_key` で引く**（test / live で id が違っても同じコード）
- これらは `scripts/stripe/setup.ts`（冪等。v1 の `stripe:create_product` / `create_plan` の置き換え）で作る。Webhook の登録だけは Dashboard で行う
- API キーは**制限付きキー**（Customers / Checkout Sessions / Subscriptions / Subscription Schedules / Invoices / Billing Meter Events / Billing Portal の必要な権限だけ）
- SDK は `stripe`（node）を `apiVersion` 固定（実装時の最新。少なくとも `2026-06-24.dahlia`）

### 4.2 最大人数の数え方

Meter に `max` が無いので、**最大値はアプリが計算し、Meter には「その期間のここまでの最大値」を `last` で送る**。

1. 在籍スタッフ数が変わるたびに、DB のトリガが**履歴**（`staff_count_history`: 利用者・時刻・その時点の在籍数）を 1 行足す（§5.2）
2. 期間 `[start, end)` の最大人数 = `max(start 時点の人数, 期間内の履歴の人数)`。TS の純関数 `staffPeak()`（`lib/billing/peak.ts`。Vitest）
3. 送るタイミング:
   - **`invoice.created`（Webhook）**: 期間が終わって請求書の下書きができたとき、明細の期間で最大人数を計算し、`timestamp = 期間の終わり − 1 秒` で送る。**これが請求に効く本番の送信**
   - **毎日の cron**: 有料プランの全員について、今の期間の最大人数を送る（Stripe の「次回の請求の見込み」を正しくし、Webhook が落ちたときの保険）。
     下書きの請求書が残っていれば、その期間の分も送り直す
   - 申し込み直後（同期のとき）に 1 回
4. `identifier = <subscription id>:<期間の開始>:<人数>` で同じ値の二重送信を Stripe 側で捨てる（`last` なので重複しても請求は変わらない）
5. 請求書の確定の猶予を **24 時間**にする（Dashboard）。Webhook が落ちても翌日の cron が間に合う

履歴方式にした理由: 期間を「JST の暦月」に決め打ちしないので、v1 から引き継ぐ Subscription（請求期間が月末 23:59:59 始まり、月によってはずれる）でも
同じコードで正しく数えられる。在籍数の変化は 1 店舗で月に数回なので、行は増えない。

### 4.3 請求日

- 新しい Subscription は Checkout で `billing_cycle_anchor_config: { day_of_month: 31, hour: 15, minute: 0, second: 0 }`（UTC）。
  **毎月末日 15:00 UTC = 翌月 1 日 0:00 JST** に期間が切り替わり、請求書は猶予の後（1 日 0 時 + 24 時間）に確定してカードに請求する
- 申し込んだ月の残り（申し込み〜月末）の従量分が初回の請求書に載るかは**テストクロックで確かめる**（§9.3）。
  載らない場合は「申し込んだ月は無料」になるので、確認画面・規約の文言をそれに合わせる（§11-4）
- v1 から引き継ぐ Subscription は請求日を動かさない（§8.2）

---

## 5. アプリ側の設計

### 5.1 権利（entitlement）の規則

`lib/billing/entitlement.ts`（純関数）と SQL の `private.staff_limit(owner)` に**同じ規則**を書き、両方をテストで固定する。

| 状態 | 在籍スタッフの上限 |
| --- | --- |
| サブスクリプションが `active` / `trialing` / `past_due` | なし（従量で請求） |
| 上記でなく、`profiles.max_staffs_count` が 10 より大きい | その値（**個別契約**。v1 の振込の 1 社。管理者が SQL で設定） |
| それ以外 | `FREE_STAFF_LIMIT`（10） |

- `past_due`（支払い失敗のリトライ中）は使えるままにする。Stripe のリトライ（Smart Retries、2 週間）が尽きたら **Subscription を解約**する設定にし（Dashboard）、
  `canceled` になった時点で無料プランへ落ちる。規約第 10 条（支払いの遅れで止める）の運用はこれで足りる
- `incomplete` / `incomplete_expired` / `unpaid` / `canceled` / `paused` は無料プラン扱い

### 5.2 スキーマ（`supabase/schemas/`）

```sql
-- profiles: 列を足す / 意味を変える
alter table public.profiles add column pricing text not null default 'v2' check (pricing in ('v1', 'v2'));
-- max_staffs_count: v1 の「上限人数」から「個別契約の上限（null = 通常）」に意味を変える（移行で値を入れ直す。§8.1）
-- stripe_subscription_id / trial_end: billing_subscriptions に移し、列は消す（trial_end は v1 のトライアル判定に残す。§7.3）

-- サブスクリプションの写し（1 人 1 件）。書くのは同期関数（service_role）だけ
create table public.billing_subscriptions (
  user_id                uuid primary key references public.profiles (id) on delete cascade,
  stripe_subscription_id text        not null unique,
  status                 text        not null,          -- Stripe の status をそのまま
  price_lookup_key       text,                          -- assift_monthly_v2 / v1 / 旧 freemium-monthly
  cancel_at              timestamptz,                   -- 解約予定（期間の終わり）
  current_period_start   timestamptz not null,
  current_period_end     timestamptz not null,
  trial_end              timestamptz,
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
- `plan_change_logs`（v1 の `usage_records`）は移行したまま**書かない・出さない**。v2 の履歴は Stripe（ポータルの請求書）にある。
  1 年使わなければ消してよい（§11-6）
- 差分 migration は `declarative sync --name billing`。テーブルと関数を足すので `unmanaged/restrict_anon_grants.sql` を末尾に追記する

### 5.3 上限の門番（トリガ）

スタッフの追加は PostgREST の INSERT（`createStaff`）、復帰は UPDATE（`retired_at = null`）、初期設定は別の Action から入る。
Action ごとに確かめると抜けるので、**`staffs` の BEFORE INSERT / UPDATE OF retired_at トリガ**で止める。

- 在籍が 1 人増える変更のときだけ、店舗のオーナーの全店舗の在籍数を数え、`private.staff_limit(owner)` を超えるなら
  `raise exception '無料プランで登録できる在籍スタッフは10人までです' using errcode = 'P0001'`（文言は Action 側で `lookup` した日本語に差し替える）
- 同時に 2 件足されて 11 人になるのを防ぐため、数える前に `profiles` のオーナー行を `for update` で取る
- `auth.uid()` が null（移行スクリプト・service_role）のときは止めない
- 同じトリガ関数の AFTER 版が `staff_count_history` に 1 行足す（前の行と同じ数なら足さない）。店舗の削除（cascade）も拾う
- 止めたときの表示: `createStaff` / 復帰 / 初期設定の Action が上の errcode を見て「無料プランは在籍スタッフ 10 人までです。有料プランに申し込むと 11 人目から追加できます」
  + 通知の中に `/account/billing` へのリンク

### 5.4 画面

URL は**利用者単位**（全店舗の合計で数えるので店舗の外）。`(protected)/account/billing/` に置く。

| 画面 | 中身 |
| --- | --- |
| `/account/billing`「プランとお支払い」 | 今のプラン（無料 / 有料 / 有料（旧料金: 11 人目から 1 人 50 円）/ 個別契約）、**いまの在籍数・今月の最大人数・今月の料金の見込み**（`monthlyPriceYen`）、状態の注意（解約予定・支払い失敗・トライアル中）、ボタン「有料プランに申し込む」または「お支払い方法・請求書・解約」（ポータル） |
| `/account/billing/subscribe`「お申し込み内容の確認」 | 特商法 12 条の 6 の最終確認（018 §6）: 料金（人数で変わること・料金表・いまの人数での見込み）、支払い時期（毎月末締め・翌月 1 日に請求）、提供時期（すぐ）、契約期間（1 か月ごと自動更新）、解約（いつでも。その月の末日まで使え、日割りなし）、返金なし、規約・特商法へのリンク。v1 の利用者でトライアルが残っていれば「◯月◯日まで無料」。ボタン「カード情報の入力へ」 |
| アカウント画面 | 「プランとお支払い」へのリンク。退会の確認に「有料プランは解約され、今月分を請求します」を足す |
| スタッフの設定 | 無料プランで 10 人に達したら `Alert`（v1 の `_upper_limit`）「無料プランは在籍 10 人までです」+ 申し込みへのリンク。追加ボタンは押せるまま（押したら §5.3 の通知） |
| 初期設定のスタッフ | 貼った名前が残りの枠を超えたら、保存の前に同じ注意を出す |
| シフト表 | **無料プランなのに在籍が 10 人を超えている**（解約・支払い失敗の後）とき、v1 の lock panel と同じく表の上に重ねる: 「無料プランの上限（10 人）を超えています。有料プランに申し込むか、スタッフを退職にしてください」+ 2 つのボタン。共有ページ・エクスポートは止めない |
| ヘッダー | 出さない（v1 の `_plan_status` は設定メニューにあったが、v2 は課金の画面に寄せる） |

- 文言の数字は `lib/billing/pricing` から引く（`PRICE_PER_STAFF_YEN` に v1 の 50 円を足し、`priceForPricing(pricing)` で選ぶ）
- Checkout から戻ったら `/account/billing?checkout=success` で同期（§5.6）してから描画し、通知「有料プランのお申し込みが完了しました」

### 5.5 Server Action（`account/billing/actions.ts`）

| Action | 内容 |
| --- | --- |
| `startCheckout()` | `requireUser()` → 同期して**既に有料なら fail**（二重契約を防ぐ）→ Customer が無ければ作る（`email`、`preferred_locales: ['ja']`、`metadata.user_id`）→ `profiles.stripe_customer_id` を保存（service_role）→ Checkout Session（`mode: subscription`、`price` = `pricing` に応じた lookup_key、`payment_method_types: ['card']`、`locale: 'ja'`、`client_reference_id`、§4.3 の anchor か v1 のトライアル、`success_url` / `cancel_url`）→ `{ redirectTo: session.url }` |
| `openPortal()` | ポータルの Session を作って `{ redirectTo }` |

- 認証系と同じく `redirect()` せず `{ redirectTo }` を返し、クライアントが `window.location.assign`（外部 URL）
- Checkout Session は `expires_at` を短く（30 分）し、同じ利用者の開きっぱなしの Session で 2 件目ができないようにする。
  それでも 2 件できたら、同期関数が新しいほうを残して古いほうを即時解約し、ログに出す（Meter は Customer 単位なので 2 件あると二重請求になる）

### 5.6 Webhook と同期（`src/app/api/stripe/webhook/route.ts`、`lib/billing/sync.ts`）

- `POST` だけ。`await request.text()` の生 body と `stripe-signature` で `constructEventAsync`。失敗は 400
- 受けるイベント: `checkout.session.completed` / `customer.subscription.{created,updated,deleted}` / `invoice.created` / `invoice.payment_failed` / `invoice.paid`
- `invoice.created` 以外は**中身を使わず** `syncCustomer(customerId)` を呼ぶだけ。同期関数は Stripe から Customer の Subscription を取り直し、
  `billing_subscriptions` を upsert / delete する（順不同・重複に強い。冪等）。`invoice.created` は §4.2 の最終送信
- Customer → 利用者は `profiles.stripe_customer_id` で引く（無ければ `metadata.user_id`）
- 書き込みは `createPrivilegedClient()`。中のクエリはすべて `.eq('user_id', …)` / `.eq('id', …)` で 1 人に絞る（`publicShare.ts` と同じ規律）
- **preview には Webhook が届かない**（PR ごとの URL・Deployment Protection・PR ごとのブランチ DB）。Webhook に頼らず動くよう、
  `/account/billing` の描画時（`synced_at` が古いとき）と Checkout から戻ったときにも `syncCustomer` を呼ぶ。
  preview で確かめられないのは「解約・支払い失敗が自動で反映されること」だけ（ローカルは Stripe CLI の `stripe listen` で確かめる）

### 5.7 cron（`src/app/api/cron/billing-usage/route.ts`）

- `GET`。`Authorization: Bearer ${CRON_SECRET}` が無ければ 401。Vercel Cron で毎日 1 回（`vercel.json`。Hobby でも日 1 回は可）
- 有料プランの全員について §4.2 の送信。1 人ずつ try/catch してログに出し、全体は止めない
- 送信の前に `syncCustomer` で期間を最新にする（Webhook が落ちていた日の保険）

### 5.8 退会

`deleteAccount()` の前に、有料プランなら今の期間の最大人数を送ってから `subscriptions.cancel(id, { invoice_now: true, prorate: false })`。
Customer は消さない（請求書を残す）。v1 の `delete_stripe_subscription_before_destroy` と同じ順。Stripe が失敗したら退会も止める（請求できないまま消さない）。

### 5.9 AGENTS.md に足すこと

- `createPrivilegedClient()` の用途に「Stripe の Webhook / cron / 申し込みで `profiles.stripe_customer_id` を書くとき」（`lib/billing/` に閉じる）
- `src/app/api/` は「ファイルを返す GET だけ」→ Webhook（POST）と cron（GET）を足し、それぞれの認証（署名 / `CRON_SECRET`）を書く
- ディレクトリ表の `billing/`: pricing に peak / entitlement / sync / stripe（クライアント）を足す

---

## 6. ファイル

```
scripts/stripe/setup.ts                      Product / Meter / Price / Portal 設定（冪等）
scripts/stripe/migrate-v1-subscriptions.ts   v1 の Subscription の引き継ぎ（dry-run / apply。§8.2）
src/lib/billing/
  pricing.ts (+test)        v1 の 50 円と priceForPricing() を足す
  entitlement.ts (+test)    §5.1 の規則
  peak.ts (+test)           履歴から期間の最大人数
  stripe.ts                 server-only。SDK の生成（apiVersion 固定）と lookup_key の解決
  checkout.ts (+test)       Checkout Session の引数を組む純関数（anchor / トライアル / price）
  sync.ts                   syncCustomer()。service_role
  usage.ts                  Meter への送信（identifier / timestamp を組む部分は純関数で test）
src/lib/queries/billing.ts  画面用の読み取り（RLS）
src/app/(protected)/account/billing/{page.tsx, subscribe/page.tsx, actions.ts, _components/*}
src/app/api/stripe/webhook/route.ts
src/app/api/cron/billing-usage/route.ts
supabase/schemas/public/tables/{billing_subscriptions,staff_count_history}.sql、profiles.sql、private/functions.sql
supabase/tests/billing.sql  門番・履歴・RLS
vercel.json                 crons
```

環境変数（`.env.example`）: `STRIPE_SECRET_KEY`（制限付きキー）/ `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET`。
hosted Checkout なので publishable key は要らない。未設定なら課金の画面は「現在利用できません」にし、ほかの機能（と 10 人までの利用）は動かす。

テスト:

- Vitest: `entitlement`（状態 × 個別契約）、`peak`（期間の前の行・期間内の増減・行なし）、`pricing`（v1 / v2 を Stripe の tiers と同じ表で）、
  `checkout`（anchor の値・v1 のトライアルの日付・トライアルと anchor を同時に出さない）、`usage`（identifier・期間の終わり − 1 秒）
- pgTAP: 無料で 11 人目の INSERT / 復帰が P0001、有料・個別契約なら通る、他人の店舗のスタッフ数は数えない、service_role は止めない、
  履歴が増減で 1 行ずつ増え、同じ数では増えない、2 表の RLS

---

## 7. 細部

### 7.1 料金の表示と税

- 価格は税込（018 §5。免税事業者）。Stripe の price に税率を付けず、請求書のフッター（Dashboard）に「表示の金額は税込です」。適格請求書は出さない
- 課税事業者になるときは Tax Rate と登録番号を足す（別マイルストーン）

### 7.2 Stripe のメール

Dashboard で: 支払い成功の領収書、支払い失敗、**3D セキュアの認証が必要な支払いのリンク**、カードの有効期限切れの予告を送る。言語は Customer の `preferred_locales`。
v1 の「3D セキュア非対応のカードは使えません」の注記は、Checkout が認証を扱うので出さない。

### 7.3 v1 の利用者のトライアル

v1 の規則（初回の申し込みから 2 か月後の月末まで無料）を v1 の利用者にだけ残す。

- `pricing = 'v1'` で、`profiles.trial_end` が null（一度も申し込んでいない）なら、`trial_end` = 2 か月後の月末 23:59:59 JST
- `trial_end` が未来なら、その日まで（移行時にトライアル中の Subscription は §8.2 でそのまま引き継ぐ）
- 過去なら無し
- トライアルと `billing_cycle_anchor_config` は併用できないので、トライアル付きは anchor 無し（トライアル終了 = 月末が請求日になる。v1 と同じ）

---

## 8. v1 からの引き継ぎ（データ移行・カットオーバーに足す）

### 8.1 データ（001 §5.2 の users 行を書き換える）

| v1 | v2 |
| --- | --- |
| すべてのユーザー | `profiles.pricing = 'v1'` |
| `stripe_customer_id` | そのまま（Customer は live の同じアカウント） |
| `trial_end` | そのまま |
| `max_staffs_count` | **Subscription が無く、11 以上**のユーザー（個別契約）だけその値。ほかは null |
| `stripe_subscription_id` | 入れない。移行の後に `syncCustomer` を全員に回して `billing_subscriptions` を作る |
| 在籍スタッフ数 | 全員に `staff_count_history` を 1 行（移行時点の数） |

移行の検証に足す: 無料扱いなのに在籍が 10 人を超える利用者の数（v1 の `over_limit?`。v2 では lock panel が出る）。多ければカットオーバーの前に連絡する。

### 8.2 Stripe の Subscription（`scripts/stripe/migrate-v1-subscriptions.ts`）

price が旧 `freemium-monthly` で、`active` / `trialing` / `past_due` の Subscription を列挙し、dry-run で一覧（利用者・上限・期間・状態）を出してから apply する。

| v1 の状態 | 扱い |
| --- | --- |
| 上限 11 人以上 | subscription schedule で、**今の期間の終わり**に price を `assift_monthly_v1`（Meter）へ切り替える。今の期間は v1 が送った上限（usage records の max）で請求される |
| 上限 10 人（0 円） | 即時解約（請求は 0 円）。利用者は `pricing = 'v1'` の無料プランになり、必要なときに申し込み直す |
| トライアル中 | 上の 2 つと同じ。schedule は `trial_end` を引き継ぐ |

- v1 の Subscription は `classic` のまま。請求日もそのまま（月末 23:59:59 JST 前後。v1 から変えない）
- **リスク**: 旧 metered の明細を含む Subscription に、新しい API バージョンから schedule を作れるか。テストモードで API `2022-08-01` を指定して
  v1 と同じ Subscription を作り、引き継ぎを通してから本番に使う。だめなら、そのリクエストだけ `apiVersion: '2025-02-24.acacia'` を指定する
- カットオーバーで v1 の rake（Heroku Scheduler の `stripe:create_usage_record`）を止める。切り替えまでの残りの期間は、v1 が最後に送った上限で請求される
  （上限を超えて v2 で足したスタッフは、その期間は請求されない。利用者に有利なので許容）

### 8.3 順序

1. （事前）live で `scripts/stripe/setup.ts`、Webhook の登録、猶予 24 時間・リトライ後に解約・メールの設定
2. カットオーバー: v1 停止 → データ移行（§8.1）→ `migrate-v1-subscriptions --apply` → 全員の `syncCustomer` → v1 の rake を止める
3. 翌月 1 日: v1 の利用者の最初の Meter の請求書を Dashboard で突き合わせる（v1 の上限での料金 ≥ v2 の請求になっているはず）

### 8.4 告知（カットオーバーの告知に含める。016-terms §5 の 548 条の 4 の周知と一緒に）

- 料金はそのまま（11 人目から 1 人 50 円）。上限を 5 人単位で選ぶ仕組みは無くなり、**その月の在籍スタッフの最大人数**で請求する（同じ人数なら今より高くならない）
- 上限で止まることが無くなるので、人数を増やすとその月から料金が変わる
- 請求書・カードの変更・解約は「プランとお支払い」から（Stripe の画面）

---

## 9. 実装の順序と確認

### 9.1 順序

1. Stripe のテストモードで §9.3 の 1〜3 を手で確かめる（anchor・初回の請求・`last`）。結果で §4.3 / §11-4 を確定する
2. スキーマ（§5.2・§5.3）+ pgTAP
3. `lib/billing/*` の純関数 + Vitest
4. 同期・Webhook・cron
5. 画面（プランとお支払い・確認画面・上限の注意・lock panel）
6. 規約・特商法・LP の文言を実装に合わせる（支払い時期「翌月 1 日」、初回の端数期間の扱い）
7. 引き継ぎスクリプト（テストモードで v1 相当の Subscription を作って通す）

### 9.2 ローカル

- `stripe listen --forward-to localhost:3000/api/stripe/webhook` の出す secret を `.env.local` に。クラウドのセッションで Stripe CLI が使えなければ、
  Webhook の確認はローカルの PC で行い、ここでは同期関数（ページ描画時）で確かめる
- cron は `curl -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/billing-usage`

### 9.3 テストクロックで確かめる筋書き

1. 10/15 に申し込む → 期間が 10/31 15:00 UTC で切り替わる / 初回の請求書に 10/15〜月末の従量分が載るか
2. 11 月に 12 → 15 → 11 人と動かす → 12/1 の請求書が 15 人 = 500 円（v1 の利用者なら 250 円）
3. 2 月をまたいで anchor が月末（2/28・29）15:00 UTC になる
4. 月の途中で解約（ポータル）→ 月末まで有料 → 翌月 1 日の請求書がその月の最大人数 → 以降 0 円・`canceled` → 10 人超ならロック
5. カードを `4000 0000 0000 0341`（請求で失敗）にする → `past_due` → リトライが尽きて `canceled`
6. 3D セキュアを求めるカード（`4000 0027 6000 3184`）で申し込み・月次の請求
7. 退会 → 即時解約・その場で請求書
8. v1 の Subscription（API `2022-08-01`・旧 metered・トライアル付き）を作り、引き継ぎ → 期間の終わりで Meter の price に切り替わる

---

## 10. やらないこと

- 年払い・クーポン・請求書払い（振込）を Stripe で扱うこと（個別契約は `max_staffs_count` で手当てし、請求は従来どおり手作業）
- 管理画面（課金中の一覧・売上のグラフ。v1 の `admin/graph`）。必要なら Stripe の Dashboard で見る
- 店舗ごとの課金（v1 と同じく利用者単位）
- v1 の `invoices` の再現、`plan_change_logs` の表示

---

## 11. 未確定（ユーザーに確認する）

| # | 論点 | 推奨 | 代案 |
| --- | --- | --- | --- |
| 1 | v1 の利用者の「既存のプラン」をどこまで残すか | **料金（1 人 50 円）とトライアルを残し、仕組みは v2（月内の最大在籍数・1 人単位）にそろえる**（§2.4） | v1 と同じく 5 人単位の上限を選ばせる（画面と送信が 2 系統になる） |
| 2 | 旧料金の対象 | **v1 から移行した全ユーザー** | v1 で有料プランを契約していた（上限 11 人以上の）ユーザーだけ |
| 3 | 新規ユーザーのトライアル | **なし**（10 人まで無料が試用を兼ねる。LP・規約もトライアル無しで書いてある） | v1 と同じく 2 か月 |
| 4 | 申し込んだ月の残りの期間 | テストクロックの結果に合わせる（請求されるなら「申し込んだ月から請求」、されないなら「申し込んだ月は無料」と書く） | — |
| 5 | 無料で 10 人を超えたとき（解約・支払い失敗の後） | **v1 と同じくシフト表をロック**（共有・エクスポートは止めない） | 注意を出すだけで使わせる |
| 6 | `plan_change_logs` | 移行して保管のみ（表示しない） | 移行しない（v1 の dump に残る） |

---

## 12. 実装ログ

（実装後に追記する）
