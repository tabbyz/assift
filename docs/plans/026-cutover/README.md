# 026: カットオーバー（v1 → v2 の切り替え。当日の手順書）

- 前提: 001 §5.4（カットオーバー手順）/ 016-terms §7 2026-10-13（制定日・連絡先・DNS・告知）/ 019 §8（v1 からの引き継ぎ。§8.2.3 スクリプトの流し方・§8.3 順序）/
  020 §10（管理画面のホスト）/ 021 §9.3（本番に対する予行）・§10（カットオーバーでの位置）・§15（リハーサルの所要と申し送り）/
  024 §4.8（Deploy to production の確かめ方）・§6（当日に差し替える値）・§10（申し送り）/ 025 §6.3（解析の当日の確認）
- 番号: 021 の「022（カットオーバー）」・024 の「カットオーバーのプラン」が本プラン。025 はアクセス解析に使ったので **026**
- 日時: **2026-10-30（金）22:00 開始、24:00 までに公開**（= DNS の切り替えを終える）。作業は利用者の手元の Mac（Postgres 16 と v1 の環境がある。021 §15）、
  クラウドのセッションが手順と記録を伴走する
- 予定: プランは 10/15〜10/16（クリティカルパス）。コードの変更（§7・§8・§14）は 10/27 までに main へ（§14 は本番での空振り（§4-1、10/22 まで）より前に）
- **作業するのは人間**（Heroku / Stripe / Vercel / Supabase / Google / Gehirn の操作と秘密の値）。リポジトリの変更は §7・§8・§14 の 3 つだけ

**状態: プラン確定（2026-10-16）。§3 の決定を入れ、レビューを 6 回行って収束した（§13。6 回目は高・中 0 件）。DNS の今の値は §12。未確定は §11（実測で埋めるものと Stripe の鍵）。§14（中止のときの片付け）は 2026-10-16 に足した節で、実装済み・本番での空振りが残り。**

## 1. 目的と完了条件

v1（Rails / Heroku）を止め、データと Stripe の契約を v2 に移し、`assift.com` / `admin.assift.com` を v2（Vercel）に向ける。
当日にすることを「手順をなぞるだけ」にする。そのために、手順・所要時間・止める基準・戻し方をすべて先に決めておく。

- [ ] 前提のゲート（§4）がすべて満たされ、10/30 の昼に Go を決めた
- [ ] v1 の全データが本番の Supabase に入り、021 §8.1 の突合と `verify.ts` が通った
- [ ] Stripe の引き継ぎ（019 §8.2.3）と全員の同期（§7）が済み、有料プランの人がロックされていない
- [ ] `https://assift.com` と `https://admin.assift.com` が v2 を返し、§6.5 の確認が通った
- [ ] 公開後の作業（§6.6）を期日つきで残した

## 2. 範囲

### する

| # | 内容 | 節 |
| --- | --- | --- |
| 1 | 前提タスクのゲート（期限と、満たさなければ延期） | §4 |
| 2 | 事前の作業（数日前〜当日の昼） | §5 |
| 3 | 当日のタイムライン（止める・戻す判断点つき） | §6 |
| 4 | 公開後の作業（翌日〜1 年） | §6.6 |
| 5 | 全員の同期を流すスクリプト `npm run stripe:sync-all`（§3-4） | §7 |
| 6 | v1 の Service Worker を解除する `/serviceworker.js`（§3-7） | §8 |
| 7 | 各プランの申し送りの取り込みと、元のプランへの注記 | §9 |
| 8 | 中止のときの片付けの SQL `scripts/migrate-v1/undo.sql`（§6.4） | §14 |

### しない（別のタスク。§4 でゲートとして扱う）

- Stripe の live（019 §8.3-1・2: `stripe:setup`・Webhook の登録・Dashboard の設定・`STRIPE_*` / `CRON_SECRET`）
- 021 §9.3 の本番に対する `--rollback` の予行（所要時間と権限の確認。§6 の時刻はこれで確定する）
- v1 の利用者への告知（10/29。016-terms §7 2026-10-13・019 §8.4）
- 規約・プライバシーポリシー・特商法表記の公開前の最終レビュー（016-terms §7 2026-10-13）
- 管理画面の MFA・セッションの結び付けの再検討（020 §12-4・8。「運用開始までに再検討」）。本プランでは扱わず、020 に残す

## 3. 決定（2026-10-15）

| # | 項目 | 決定 | 理由 |
| --- | --- | --- | --- |
| 1 | 日時 | 10/30（金）22:00 開始、24:00 までに DNS を切り替える | 016-terms §7（制定日 10/30）・019 §8.3-3（月の下旬）。Heroku のメンテナンス枠（日曜 03:00〜07:00 JST）と自動バックアップ（02:00 JST）に重ならない（021 §15 の申し送り） |
| 2 | 日付をまたいだとき | **3 ページ（`/terms`・`/privacy`・`/law`）の日付は 10/30 のまま**。016-terms §7 2026-10-13 の「10/31 に直してから出す」を上書きする | 告知（10/29 に「10/30 から適用」）が先に届くので民法 548 条の 4 の要件は満たす。24:00〜公開の数時間は v1 も v2 も利用者が使えず、料金が変わるのも各契約の期間の終わりから（10/31 23:59 ごろ）なので、日付が公開より数時間前でも不利になる人がいない。告知・添付の PDF・ページの日付がそろう。当夜の作業（日付の PR・merge・デプロイ待ち）が減る |
| 2a | 当夜を中止して日を改めたとき | 3 ページの日付と告知をやり直す（§6.4） | #2 が通るのは、その夜のうちに公開できたときだけ |
| 3 | 当夜の `--rollback` | **当日の昼の予行（§5 T-0）で代え、夜は本番に 1 回だけ流す**。昼の予行は**その場で取った新しいダンプ**で流す（v1 を止めずにできる）。021 §10-3 の「`--rollback`（最終確認）→ 本番」を上書きする | インポートはローカルで 17 分、本番は Session pooler 越しでさらに延びる。2 回流すと 2 時間に収まらない。昼のダンプで流せば、ネットワーク・権限・所要に加え、リハーサル（10/13）の後に入ったデータの異常（西暦 5 桁の日付のようなもの）も昼のうちに見つかり、夜に増える情報は昼からの数時間の差分だけになる |
| 4 | 全員の同期（019 §8.3-4・021 §10-6）の流し方 | **同期だけを流すスクリプト `npm run stripe:sync-all` を足す**（§7） | 今は cron のルートからしか呼べず、当日は cron を止める（#5）。cron のルートを手で叩くと人数の送信（`reportAllUsage`）まで走る |
| 5 | cron | **当日の昼に Vercel の Settings → Cron Jobs で無効にし、10/31 の昼に戻す**。021 §10-3 の「23 時台を避ける」はこれで不要になる | 23:20 / 23:50 の同期がインポート・引き継ぎの最中に `profiles` / `billing_subscriptions` に書くのを避ける。新料金の契約の 10 月の期間は 11/1 0:00 に終わるので、最終日の送信（10/31 23:20）より前に戻すのは必須（019 §4.2-3） |
| 6 | Stripe の引き継ぎ・全員の同期と DNS の順 | **DNS の切り替えの前**（021 §10 のまま） | 同期の前は `billing_subscriptions` が空で、有料プランの人も上限超過でロックされる（021 §15「CSV と必要人数」） |
| 7 | v1 の Service Worker | **v2 に自分を解除する `/serviceworker.js` を置く**（§8）。10/27 までに main へ | 放置すると登録が消えず（v2 で 404 でも古い Service Worker は残る）、v2 のすべてのリクエストが v1 の Service Worker を通り続け、通信の失敗時に v1 の `offline.html` が出る |
| 8 | Deploy to production（Supabase の GitHub 連携） | **当日はオフのまま**。公開の翌週に 024 §4.8 の手順（前後で Auth の画面を比べる）で確かめてからオンにする | 024 §3-10。当日に本番のスキーマを動かさない |
| 9 | 前提タスク | Stripe の live・021 §9.3・告知・3 ページのレビューは、本プランでは**期限つきのゲート**として書くだけ（§4） | それぞれのタスクで中身を扱う |
| 10 | v1 を止める時期 | 公開から **1 週間**（〜11/6 ごろ）は Heroku をメンテナンスモードのまま残してから止める。メンテナンス中は `@assift.com` の管理者アカウントで v1 にログインしない | 10/31 の期間の切り替えと 11/1 の請求の突き合わせ（019 §8.3-5）を見届ける。v1 の `maintenance_mode` は管理者を通す（v1 `ApplicationController`）ので、ログインすると書き込めてしまう |
| 11 | Stripe の Webhook の URL | **`https://v2.assift.com/api/stripe/webhook` で登録し、当日の DNS の切り替えの後に `https://assift.com/api/stripe/webhook` へ変える**（Stripe の live のタスクへの依頼。§4） | `assift.com` で登録すると、DNS の切り替えまで（= 引き継ぎスクリプトの実行中）のイベントが v1 に当たって失敗し、再送待ちになる（024 §10）。`v2.assift.com` は v2 の本番なので、引き継ぎ中のイベントがその場で同期される。URL を変えても署名の secret は変わらない |
| 12 | 当夜の Webhook の受け付け | **22:00 に Stripe の Webhook のエンドポイントを無効にし、判断点 B（§6.3）の直後、`--apply` の前に有効に戻す**。止めていたあいだのイベントは 23:25 の `stripe:sync-all` が拾う | インポートの COMMIT の後は、v1 の Customer のイベントで `syncCustomer()` が持ち主を引けるようになり、Stripe に書く（二重契約の解約・Customer のメールの更新。`lib/billing/sync.ts` の `applySubscriptions`）。判断点 A の「Stripe に何もしていないので戻せる」を守る。インポート中は `profiles` の書き込みがトリガを止めたロックで待たされる（021 §6.1）ことも避けられる |
| 13 | 当夜に「移行しないのに店舗を持つ人」が 1 件以上出たとき | **止めずに COMMIT し、その人には翌日以降に個別に連絡する**。昼の予行（新しいダンプ）で 1 件以上出ていたら `--overrides`（`forceMigrateUsers`）のファイルを用意して当夜に渡す | 1 回きりの COMMIT なので、後から `--overrides` で足せない。リハーサルでは 0 件（021 §15）で、昼の予行で 0 件なら、出ても昼からの数時間の差分に限られる |
| 14 | `www.assift.com` | **作らない**（v1 と同じ） | Gehirn に `www` のレコードが無い（§12 2026-10-15）。v1 は apex だけで動いていたので、`www` に v1 の Service Worker は残っておらず、§8 の注意は当たらない |

## 4. 前提のゲート

判断は 2 回。

- **10/29、告知を送る前**: 1〜4 が済んでいなければ告知を送らず、日を動かす（告知の後に落ちると、告知のやり直しが要る）。§11-5（Stripe の段が窓に収まらないとき）もここで決める（開始の時刻を変えると告知に書くメンテナンスの時間が変わる）
- **10/30 の 12:00**: 5・6 も済んでいなければ延期する（告知のやり直しが要る。§6.4「日を改めたとき」）

| # | ゲート | 期限 | 確かめ方 | 担当のタスク |
| --- | --- | --- | --- | --- |
| 1 | 021 §9.3 の本番に対する `--rollback` が通り、所要時間が分かっている。必要なら `COPY` に替えた（021 §13-8） | 10/22 | 021 §15 に所要・RSS・§13-4（`postgres` ロールの権限）の結果。§6 の時刻を実測で埋めた。同じ日に §14 の片付けの SQL を確認だけのモードで本番に流し、権限のエラーなしに ROLLBACK で終わる（§14.5） | 021 §9.3 |
| 2 | Stripe の live: `stripe:setup` と移行用の鍵（§11-3）は **10/22 まで**（§5 の 10/23 の計測の前提）、Webhook の登録（§3-11 の URL）、Dashboard の設定（019 §4.1）、**解約メールのオフ**（019 §8.3-2）、Vercel の Production に `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET` | 10/27 | 019 の実装ログ。`CRON_SECRET` は鍵付きで `curl -i -H "Authorization: Bearer …" https://v2.assift.com/api/cron/billing-usage` が 200（鍵が無くても 401 になるので、鍵なしの 401 では確かめられない）。Webhook のエンドポイントは API の版を `2026-09-30.endive` で登録する（019 §12 2026-10-08。アカウントの既定は古い版）。`STRIPE_WEBHOOK_SECRET` は Stripe のテストイベントの送信が **400 にならない**こと（400 は署名が合わない。処理しない種類は 204、架空の Customer の処理する種類は 500 になりうるので、2xx を基準にしない。`api/stripe/webhook/route.ts`） | Stripe の live |
| 3 | `stripe:sync-all`（§7）と `/serviceworker.js`（§8）と `undo.sql`（§14）が main に入った | 10/27（§14 は §4-1 の空振りより前） | §7 はローカルの Supabase とサンドボックスで（§7.3）、§8 は手元と `v2.assift.com` で（§8.3）、§14 はローカルの Supabase と本番での空振りで（§14.5） | 本プラン |
| 4 | 3 ページの最終レビューが済み、文面が確定した | 10/28 | 016-terms §7 | 規約 |
| 5 | 告知を送った（10/29。規約・ポリシーの全文の PDF を添付、「10/30 から適用」）。本文に入れる申し送り: メンテナンスの時間（10/30 22:00〜）と、切り替え後は再ログインが要ること（001 §5.4-2）/ パスワードを持たない人（Google だけで使っていた人・代理承認の人）は「パスワードを忘れた方」から作る（021 §8.2-8b）/ スタッフ 0 人でデータのある店舗 1,845 件は初期設定の画面から始まる（021 §15。触れるかは告知のタスクで決める）/ 料金（019 §8.4）/ 規約の周知（016-terms §7） | 10/29 | 送った日時・件数・添付の版の記録（016-terms §7 2026-10-13） | 告知 |
| 6 | 当日の昼の予行（§5 T-0）が通った | 10/30 12:00 | 所要が 021 §9.3 の実測から大きく外れていない | 本プラン |

## 5. 事前の作業

| いつ | すること | メモ |
| --- | --- | --- |
| §4-1 のあと | §6 の各段の時刻と、中止の判断の時刻（§6.4）を実測で埋める | ローカルの実測: capture 52 秒 / download 1〜2 分 / restore 1 分 17 秒 / エクスポート 13 分 37 秒 / インポート 17 分（021 §15） |
| 10/23 まで | **前提: live で `stripe:setup` が済み（price `assift_monthly` とクーポン `assift_v1_legacy` が無いとスクリプトは最初に止まる）、移行用の鍵（§11-3）ができていること**。`stripe:migrate-v1` の dry-run をリハーサルの `v1-subscriptions.csv` で live に流し、所要を測る（読むだけで書かない。`--output ~/v1-export/<リハーサルの dir>/v1-subscriptions-dryrun.csv` を付ける。既定ではリポジトリの直下にメール入りの CSV を書く）。`--apply` の所要は区分ごとの呼び出しの回数（`unpaid` は溜まった下書きの数 × 3 回など。dry-run の結果 CSV の `actions` から数える）から見積もり、§6.3 の時刻に入れる。**dry-run と `--apply` の合計が 25 分を超える見込みなら、§11-5 で開始の時刻か事前の処理を決め直す** | 約 989 件を 1 件ずつ順に処理し、区分を絞る引数は無い。`unpaid` の 134 件は毎月の下書きが溜まっている（019 §8.2.1）。判断点 B の後に時間が足りなくなると戻せない |
| 10/16〜（本番での空振りは §4-1 の日） | 中止のときの片付けの SQL（COMMIT した後に v1 へ戻す場合。§6.4）を書き、ローカルで通す（§14） | `truncate public.tenants cascade` の後に管理用以外の `auth.users` を消す（§14.2-1。当初の「`auth.users` の cascade だけ」を上書き）。`shifts` 1,150 万行の削除の所要も測る（§14.5） |
| 10/27 まで | §7・§8・§14 を main に入れ、§8 は `v2.assift.com` で確かめる（§14 は §4-1 の空振りより前に main へ。空振りは main のファイルで流す） | §4-3 |
| 10/27 以降 | **main への merge を止める**（直しが要るものだけ。merge すると Production が自動でデプロイされる）。3 ページの文面の修正（§4-4）は例外 | 当日の本番のコードを固定する |
| 10/29（前日） | Gehirn DNS の今の値（§12 2026-10-15）から変わっていないか見る | apex の A は Heroku へのエイリアス（ALIAS）で、TTL の欄が無い（参照先の TTL に従う）ので、前もって下げる手順は要らない。当夜に作る A と CNAME は TTL 300 で作り、落ち着いたら 3600 に戻す（§6.6） |
| 10/29 | `npx supabase migration list` で本番の migration が main と揃っている（Local と Remote が同じ本数） | Deploy to production はオフ（§3-8）なので、merge した migration は `db push` で手で入れる（024 §3-10） |
| 10/29 | v1 の管理画面で、旧料金に移す契約の今月の売上の値を控える | 019 §8.2.3-1 の「392 件の請求見込みが v1 の売上と大きく違わない」の突き合わせ用。当夜は v1 に管理者でログインしない（§3-10） |
| 10/29 | 当日の手元の準備: `mkdir -p ~/v1-export/dumps ~/v1-export/noon-20261030`（`download -o` は親のフォルダを作らない見込み）/ v1 の作業ディレクトリ（`a8bb5ad`）に最新の `v2_export.rake`（照合を絞った版。`ecfc533` 以降）を写す / Postgres 16（port 5433）/ v2 の作業ディレクトリを最新の `main` にして `npm ci` / 秘密の値（DB の接続文字列・`SUPABASE_SECRET_KEY`・Stripe の鍵）がパスワードマネージャから出せる | 秘密の値は `.env.local` に書かない。コマンドごとに環境変数で渡す（021 §11）。v1 の起動には `DATABASE_URL=postgres://$(whoami)@localhost:5433/<名前>` とダミーの `STRIPE_SECRET_KEY` が要る（021 §15「v1 をつなぐ」） |
| 10/30 昼（T-0）**11:00 までに開始** | 昼の予行（約 50 分。v1 は止めない）: `heroku pg:backups:capture` → `download -o ~/v1-export/dumps/<backup id>.dump` → 手元に restore（`createdb -p 5433 assift_v1_noon` → `pg_restore -p 5433 -d assift_v1_noon --no-owner --no-acl -j 4 ~/v1-export/dumps/<昼の backup id>.dump` → `vacuumdb -p 5433 --analyze-only assift_v1_noon`）→ `DATABASE_URL=postgres://$(whoami)@localhost:5433/assift_v1_noon STRIPE_SECRET_KEY=<ダミー> bundle exec rails "v2:export[$HOME/v1-export,<dumped_at>]"`（`DATABASE_URL` を必ずこの行で渡す。v1 の development の既定や、シェルに残ったリハーサルの値で古いデータを書き出さない）→ `NODE_OPTIONS=--max-old-space-size=16384 MIGRATION_DATABASE_URL='<Session pooler>' npm run migrate:v1 -- --input <昼の dir> --rollback` を本番に流す → 続けて `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <昼の dir>/v1-subscriptions.csv --output <昼の dir>/v1-subscriptions-dryrun.csv`（読むだけ）→ **dry-run の CSV と `report.json` を `~/v1-export/noon-20261030/` へ写す**（夜の 23:00 の比べる相手と、`max_staffs_count` を入れる人の候補。22:06 の削除の対象外）。`<昼の dir>` は昼の rake の `exported to …`、`<dumped_at>` は昼のバックアップの Started（22:02 と同じ取り方）。`report.json` の「移行しないのに店舗を持つ人」が 0 件か、変換で止まらないか、dry-run の突合（§6.3 23:00 の確認）が通るかを見る。前後で本番の Supabase の Disk の使用量を見る。23:25 で使う `psql '<Session pooler>' -c 'select count(*) from billing_subscriptions'` がつながることも見る（`sslmode=verify-full` の libpq は CA のファイルを探すので、つながらなければ URL に `&sslrootcert=system`（libpq 16 以上）を足した値を 23:25 用に控える） | §3-3。ネットワーク・権限・所要・データの最終確認（021 §9.3「当日の朝にもう 1 回」）。dry-run の突合を昼に済ませておき、夜は昼との差分だけを見る。1 件以上なら `--overrides` のファイルを `~/v1-export/overrides-20261030.json`（22:06 の削除の対象の外）に用意する（§3-13）。昼のダンプ・DB・出力のフォルダは夜の 22:06 にまとめて消す（個人情報を含む。`noon-20261030/` は 23:10 の後に消す）。`--rollback` は全行を入れてから戻すので、不要な行と WAL がディスクに残る |
| 10/30 昼（予行の後） | **Disk の判断**: 本番の Supabase の Disk の使用量 + インポートで増える分（§4-1 の予行で実測）が 85% を超えるなら、**16:00 までに** Dashboard でディスクを手動で広げる | Supabase はディスクが 95% で読み取り専用になり、インポートが途中で失敗する（ROLLBACK → 判断点 A で中止）。拡張は 6 時間に 1 回までなので、夜に分かっても打つ手が無い（Supabase の仕様。§4-1 の予行のときに Dashboard で確かめる） |
| 10/30 昼 | Vercel の Settings → Cron Jobs を無効にする（§3-5） | 戻すのは 10/31 の昼（§6.6） |
| 10/30 昼 | Vercel の Domains に `assift.com`・`admin.assift.com` を足しておく（`www` は足さない。§3-14）。Vercel が示す値（apex の A の IP、`admin` の CNAME の参照先）を控える | DNS が Heroku を指しているあいだは Invalid Configuration のまま。当夜はレコードを変えるだけにする。`admin-v2` の参照先（`f319020a4f43f5f1.vercel-dns-016.com.`）と同じになる見込みだが、画面の値を使う |
| 10/30 12:00 | §4 のゲートで Go / 延期を決める | |

## 6. 当日のタイムライン（10/30）

時刻は目安。**§4-1 の実測で埋め直す**（インポートの 23 分は、ローカルの 17 分に pooler の分を仮に 1.3 倍で見込んだもの）。

- `<dir>` は、22:08 の rake が最後に出す `exported to …` のフォルダ（`~/v1-export/<YYYYMMDD-HHMM>`。rake は第 1 引数の下に日時のフォルダを作って書く。`v2_export.rake`・021 §5.1）。以降の `--input`・CSV・`--output` はすべてここ
- コマンドは Mac の zsh で打つ前提。角括弧を含む引数（rake のタスク名）は引用符で囲む

### 6.1 止める（22:00〜22:25）

| 時刻 | 手順 | 確かめること | 出典 |
| --- | --- | --- | --- |
| 22:00 | Heroku `MAINTENANCE_MODE=on` | `https://assift.com` が 503（v1 の `public/503.html`）。管理者でログインしない（§3-10） | 001 §5.4-3・021 §10-1 |
| 22:00 | Stripe の Webhook のエンドポイントを無効にする（§3-12） | Dashboard でエンドポイントが Disabled | §3-12 |
| 22:01 | Heroku Scheduler の `stripe:create_usage_record` を止める（ジョブを消す）。**消す前にコマンド・頻度・時刻をメモに控える**（中止して戻すとき用。§6.4） | Scheduler の一覧に無い | 019 §8.2.2・021 §10-1 |
| 22:02 | `heroku pg:backups:capture -a assift` → `heroku pg:backups:download <backup id> -a assift -o ~/v1-export/dumps/<backup id>.dump` | capture 約 1 分・download 1〜2 分。バックアップの id と、`heroku pg:backups:info <backup id> -a assift` の Started（表示は UTC なので `+09:00` の ISO 8601 に直す。rake の 2 つ目の引数 `dumped_at`。`v2_export.rake` の冒頭）を控える。**ファイル名に id を入れる**（指定しないと作業ディレクトリの `latest.dump` になり、昼のダンプと取り違えうる。昼のダンプを restore すると、昼からの書き込みが黙って失われ、件数の突合でも気付けない） | 021 §10-2 |
| 22:06 | リハーサルと昼の予行の DB を消し（つないでいる `rails s` を止めてから。`dropdb -p 5433 --force assift_v1_rehearsal` と `assift_v1_noon`）、新しいダンプを restore（`createdb -p 5433 assift_v1_cutover` → `pg_restore -p 5433 -d assift_v1_cutover --no-owner --no-acl -j 4 ~/v1-export/dumps/<22:02 の backup id>.dump` → `vacuumdb -p 5433 --analyze-only assift_v1_cutover`）。リハーサルのダンプ（`b2818`）と昼のダンプ、リハーサルと昼の出力のフォルダ（`~/v1-export/` の 10/13・10/14・昼）も消す。**`overrides-20261030.json` と `noon-20261030/` は消さない**。restore するファイルの id が 22:02 で控えた id と同じことを確かめる | 約 1〜2 分。件数を控える | 021 §15（リハーサルのダンプと DB はカットオーバーのダンプを取った時点で消す） |
| 22:08 | `DATABASE_URL=postgres://$(whoami)@localhost:5433/assift_v1_cutover STRIPE_SECRET_KEY=<ダミー> bundle exec rails "v2:export[$HOME/v1-export,<dumped_at>]"` | 約 14 分。最後の `exported to …` が `<dir>`。manifest の件数が restore した DB と一致。`<dir>` に保管用の `usage_records.csv` も出る（021 §5.1・§10-8(b)） | 021 §10-2 |

### 6.2 入れる（22:25〜23:00）

| 時刻 | 手順 | 確かめること | 出典 |
| --- | --- | --- | --- |
| 22:25（直前に本番の Disk の使用量を見る。昼の判断の基準を超えていたら中止） | `NODE_OPTIONS=--max-old-space-size=16384 MIGRATION_DATABASE_URL=… npm run migrate:v1 -- --input <dir> [--overrides ~/v1-export/overrides-20261030.json]`（`--rollback` なし。§3-3。`--overrides` は昼の予行で要ると分かったときだけ。§3-13） | 021 §8.1 の突合がすべて OK で COMMIT。所要と RSS を控える。`report.json` の `over_limit` と「移行しないのに店舗を持つ人」を控える。`<dir>/v1-subscriptions-not-migrated.csv` の件数を見る（想定 0 件。1 件以上なら判断点 B の後に Dashboard から解約する。021 §6.1） | 021 §10-3 |
| 22:50 | `MIGRATION_DATABASE_URL=… npm run migrate:v1:verify -- --input <dir>` | すべて一致 | 021 §10-4 |
| 22:52 | 021 §8.2 の 2〜4・7・8・9 を **`https://v2.assift.com`** で確かめる（DNS の前なので仮のホストで見られる。Google の生成元と Redirect URLs にも `v2` が残っている） | 自分のアカウントで **Google ログイン**（v1 で Google だった人の自動リンク。021 §8.2-8 の残り。利用者本人は Google の人でパスワードを失念している。021 §15）/ 旧 URL の 308 / 共有 URL / 準備中に送られない / 課金の列 | 021 §10-4 |

**判断点 A（23:00 の目安。§6.4）**: ここまでに COMMIT と検証が済んでいなければ中止して v1 に戻す。ここまでは Stripe に何もしていないので、戻せる。

### 6.3 Stripe と公開（23:00〜24:00）

| 時刻 | 手順 | 確かめること | 出典 |
| --- | --- | --- | --- |
| 23:00 | `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <dir>/v1-subscriptions.csv --output <dir>/v1-subscriptions-dryrun.csv`（dry-run。989 件を 1 件ずつ取るので数分。§5 の実測で時刻を直す） | **昼の dry-run の結果（`~/v1-export/noon-20261030/`）との差分を見る**（突合そのものは昼に済ませる）。件数が 019 §8.2.1 と合う。旧料金に移す 392 件の請求見込み（結果 CSV の `legacy` と `rescue` の行で Σ(`max_staffs_count` − 10) × 50 円。スクリプトは金額を出さない）が、10/29 に控えた v1 の売上と大きく違わない（v1 の管理画面の予想売上は `max_staffs_count >= 11` の全員の Σ(max − 10) × 50 で、救わない `unpaid` や個別契約の人も含むので、そのぶん v1 のほうが大きい。v1 `admin/graph_controller.rb`）。`skip`・`review`・取得できません・Customer が一致しません で `max_staffs_count >= 11` の人を `report.json` の `over_limit.freeOverLimit`（`hasSubscription: true`）と突き合わせ、個別契約なら管理画面（DNS の前なので **`admin-v2.assift.com`**）で `max_staffs_count` を入れる（021 §10-5） | 019 §8.2.3-1 |
| 23:05 | **判断点 B（戻せなくなる点）**: ここで Go を決める | 以降は Stripe の契約を書き換えるので、v1 に戻すとそのぶんを手で戻すことになる。問題が出たら前に進めて直す | |
| 23:05 | Stripe の Webhook のエンドポイントを有効に戻す（§3-12）。`v1-subscriptions-not-migrated.csv` に行があれば Dashboard で解約する | Enabled | §3-12・021 §6.1 |
| 23:05 | `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <dir>/v1-subscriptions.csv --apply --limit 5 --output <dir>/v1-subscriptions-limit5.csv` → Dashboard で目で確かめる | Customer の言語・schedule の中身・無効にした下書き・`active` に戻ったこと | 019 §8.2.3-2 |
| 23:10 | `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <dir>/v1-subscriptions.csv --apply --output <dir>/v1-subscriptions-apply.csv`（残り全部。所要は §5 の見積もり） | 結果の CSV は 3 つとも `<dir>` に残す（`--output` を省くと作業ディレクトリの同じ名前に上書きされ、個人情報が repo の下に残る）。済んだら `~/v1-export/noon-20261030/` を消す。**失敗が 1 件以上なら**同じ行を `--output <dir>/v1-subscriptions-apply2.csv`（回ごとに `apply3`… と名前を変える。結果の CSV は終わりに 1 回だけ書かれるので、要約が出ずに止まった回は CSV が無い。そのときも次の名前で流し直す。前の回と同じ行が同じ理由で失敗しただけなら流し直さない。23:00 の dry-run で既に `取得できません` だった行や、解約の予約の `想定外の schedule` は流し直しでは直らない）で流し直す（冪等。済んだ行は `schedule 既存`・`skip` になり、救った行は 2 回目から `legacy` に数えられる。前の回が作りかけで残した schedule は `schedule 組み直し` で続きから組む）。失敗が 0 件になった回の「区分ごとの件数」の `legacy` + `rescue` と、その回の CSV の名前を控える（23:25 の基準。回をまたいでも和は変わらない）。0 にならなければ、最後の回の `legacy` + `rescue`（失敗の行も含めたまま。`legacy` の失敗は `active` のまま数に入り、`active` に戻らなかった `rescue` は 23:25 の `comm` の左の列に出る。`取得できません` の行は区分が空で数に関わらない）と、その回の CSV を基準にし、失敗の行を控えて Dashboard で見る（`想定外の schedule があります` で、Dashboard のその schedule が旧 price の 1 本 + 期間の終わりで解約なら、利用者が解約を予約した正常な状態。それ以外の失敗で、その契約に旧 price だけ + 期間の終わりで release の schedule があれば作りかけ: 23:25 の `legacy_without_schedule` には出ないので、10/31 の期間の終わりまでに Dashboard で新 price + クーポンの phase を足す） | 019 §8.2.3-3・4 |
| 23:25 | `STRIPE_SECRET_KEY='<鍵>' NEXT_PUBLIC_SUPABASE_URL=https://assift.supabase.co SUPABASE_SECRET_KEY='<本番の secret key>' npm run stripe:sync-all`（§7。tsx は `.env*` を読まない。シェルにローカルの値が残っているとローカルを同期して `failed: 0` で通ってしまうので、3 つとも必ずこの行で渡す） | npm の表示（`> …` の 2 行）の次の行が `接続先: Supabase assift.supabase.co / Stripe live`（違えば Ctrl-C で止めて、3 つの値を渡し直す）。所要は数分の見込み（実測なし。途中の出力は無い）。`failed: 0`（1 以上なら同じ行を流し直す。冪等。同じ Customer が残れば `[billing] 同期に失敗しました (customer: …)` を控えて Dashboard で見る）。`[billing] 二重の契約を解約します` が出たら、その user と subscription を控える。**件数**（`<DB>` は 22:25 の `MIGRATION_DATABASE_URL` と同じ値。昼に `sslrootcert` つきの値を控えたならそれ）: `psql '<DB>' -X -c "select count(*) filter (where status in ('active','trialing','past_due')) as entitled, count(*) filter (where status in ('active','trialing','past_due') and price_lookup_key = 'freemium-monthly' and not has_schedule) as legacy_without_schedule from billing_subscriptions"` で、`entitled` が 23:10 で控えた `legacy` + `rescue` と一致し、`legacy_without_schedule` が 0（019 §5.7 の見張りの代わり）。総件数は見ない（23:05 から Webhook が即時解約の `canceled` の行を書くため）。**ずれたら**: `awk -F, 'NR>1 && ($9=="legacy" \|\| $9=="rescue"){print $4}' <基準の回の CSV> \| sort > <dir>/ids-csv.txt`（行数 `wc -l < <dir>/ids-csv.txt` が 23:10 で控えた `legacy` + `rescue` と同じこと。違えばメールにカンマを含む行などで列がずれている）と `psql '<DB>' -X -At -c "select stripe_subscription_id from billing_subscriptions where status in ('active','trialing','past_due')" \| sort > <dir>/ids-db.txt` のあと `comm -3 <dir>/ids-csv.txt <dir>/ids-db.txt`（CSV の 4 列目が `subscription`、9 列目が `category`。個人情報なので `<dir>` に置く）。左の列（CSV にあって有効な行に無い）は `psql '<DB>' -X -c "select user_id, status from billing_subscriptions where stripe_subscription_id = '<id>'"` で状態を見て Dashboard へ（23:30 までは v1 の設定なのでリトライの尽きた `past_due` が `unpaid` になりうる・行が無ければ持ち主が引けていない）。右の列（有効な行にあって CSV の `legacy` / `rescue` に無い）は CSV のその行の `category` と `result`（CSV に無ければ v1 の記録と別の有効な契約など）を見て、Dashboard で決める（sync-all の流し直しでは直らない）。`legacy_without_schedule` が 0 でなければ `psql '<DB>' -X -c "select user_id, stripe_subscription_id, status from billing_subscriptions where status in ('active','trialing','past_due') and price_lookup_key = 'freemium-monthly' and not has_schedule"` で出し、同じく CSV と突き合わせる。`synced` は参考（`entitled` 以上ならよい。`review` や `incomplete_expired` の契約の分だけ多い）。旧料金に移した人を 1 人、`v2.assift.com` でロックされていないこと | 019 §8.3-4・§3-4 |
| 23:30 | Stripe の Dashboard: リトライが尽きたら「解約する」へ / **解約したあとの請求書の扱い**を見て決める / 解約メールの設定を戻す | 請求書の扱い: リトライが尽きて解約になっても、設定によっては請求書が `open` のまま残る（019 §12 2026-10-08）。残ると、同じ Customer で申し込み直したときに未払いを払えてしまう（019 §11-13 と同じ懸念）。「回収不能にする」を推奨。値は §12 に記録 | 019 §8.3-4・§12 |
| 23:32 | DNS の切り替え（下の順。024 §6） | | |

DNS の切り替えの順（024 §6「Vercel にドメイン → DNS → 値の差し替え → Redeploy」。ドメインは §5 で足してある）:

1. Gehirn DNS（§12 2026-10-15 の値から）:
   - A `assift.com.`: エイリアスを **OFF** にし、Vercel が示す IP を TTL 300 で入れる（今はエイリアス ON で `concave-catfish-pri96kqt2zj223u7sugybxwq.herokudns.com.` を参照）
   - CNAME `admin.assift.com.` を足す（Vercel が示す参照先。TTL 300）
   - **ほかは触らない**: MX・TXT（SPF・`google-site-verification`・DMARC・DKIM 3 つ）・Resend の CNAME（`send`・`rsend`）・SendGrid の CNAME（§6.6 で消す）・NS（016-terms §7）
   - 戻すときは A のエイリアスを ON にして Heroku の参照先へ（判断点 B の前に限る。§6.4）
2. Vercel の Domains で `assift.com`・`admin.assift.com` が Valid Configuration になり、証明書が出る（数分）
3. Vercel の Production の環境変数: `SITE_URL=https://assift.com`、`ADMIN_HOST=admin.assift.com`
4. Supabase → Authentication → URL Configuration: Site URL を `https://assift.com`、Redirect URLs に `https://assift.com/auth/callback` を足し、`v2` を消す
5. Google Auth Platform → Clients: JavaScript 生成元に `https://assift.com` を足し、`v2` を消す（リダイレクト URI は変えない）
6. Stripe → Webhook の URL を `https://assift.com/api/stripe/webhook` に変える（§3-11）
7. Vercel の Production を **Redeploy**。終わったら Supabase の URL Configuration を開き直し、**Site URL が `https://assift.com` のまま**か見る（連携が Redirect URLs を書き換える。024 §6・§9 2026-10-15）。
   あわせて Vercel の Settings → Cron Jobs が無効のままか見る（23:50 の実行の前に）

### 6.4 中止と戻し方

| どこで | 戻し方 |
| --- | --- |
| インポートが失敗（判断点 A の前） | トランザクションごと戻っているので v2 には何も無い。直せるなら直して §6.2 からやり直す。判断点 A を過ぎたら、Heroku `MAINTENANCE_MODE=off`・Scheduler のジョブを戻し、日を改める（021 §10） |
| COMMIT の後の検証、または 23:00 の dry-run で失敗（判断点 B の前） | 直せるなら直す。戻すなら §14 の片付けの SQL（手順は §14.4）で管理用アカウントだけの状態に戻し、Heroku `MAINTENANCE_MODE=off`・Scheduler のジョブを控えた値で戻す（以下「日を改めたとき」も）。**Webhook のエンドポイントと Cron Jobs は、片付けが終わり `profiles` が管理用アカウントの 1 行だけになったのを確かめてから戻す**（残っているうちに戻すと、v1 の Customer のイベントや同期で `syncCustomer()` が持ち主を引き、Stripe に書く。`lib/billing/sync.ts` の `applySubscriptions`） |
| 判断点 B の後 | v1 には戻さない。前に進めて直す（当夜に作るレコードは TTL 300 なので、直したレコードは早く反映される） |
| 日を改めたとき | v1 を戻す（`MAINTENANCE_MODE=off`・Scheduler のジョブ）。3 ページの日付と告知をやり直す（§3-2a）。手順の中の日付入りの名前（`noon-20261030/`・`overrides-20261030.json`・`assift_v1_cutover` の扱い）は新しい日に読み替える（§14.4-6）。Vercel の Cron Jobs と Stripe の Webhook のエンドポイントを戻す。Stripe の解約メールの設定を戻すかを決める |

### 6.5 公開直後の確認（〜24:00）

| # | 確かめること | 出典 |
| --- | --- | --- |
| 1 | `https://assift.com` の LP・`/terms`・`/privacy`・`/law`（「2026年10月30日制定」）。HTML の応答に `Content-Security-Policy` | 024 §5-1・本プラン §3-2 |
| 2 | 自分の v1 のアカウントでログイン → 店舗 → シフト表 → PDF / CSV | 021 §8.2-2 |
| 3 | v1 の旧 URL（`/tenants/<22 文字>/shifts?...`）が 308 で着く / `/share/<code>` が開く | 021 §8.2-3・4 |
| 4 | `assift.com` で Google ログインが戻ってくる（JavaScript 生成元の差し替えの確認。自動リンクは 22:52 に確かめた）/ 同意画面のリンク先が `assift.com` | 024 §6・§10 |
| 5 | パスワード再設定のメールのリンクが `https://assift.com/auth/callback?...` | 024 §6 |
| 6 | `https://admin.assift.com/-/login` で入れる / 管理画面の Action が動く（例: 一覧の検索）/ `https://assift.com/-` と `*.vercel.app/-` が 404 | 020 §10 |
| 7 | Stripe の Webhook の配信が `assift.com` で成功している | §3-11 |
| 8 | v1 の Service Worker が登録されたブラウザで開き、解除される（§8.3） | §3-7 |
| 9 | Vercel Web Analytics のダッシュボードに `assift.com` の閲覧が 1 件届く | 025 §6.3 |
| 10 | CSP の違反 0 件（DevTools のコンソールに `Refused to …` が無い） | 022 §6 |

### 6.6 公開後の作業

| いつ | すること | 出典 |
| --- | --- | --- |
| 10/31 昼 | Vercel の Cron Jobs を戻す（**10/31 23:20 より前が必須**。§3-5） | 019 §4.2-3 |
| 10/31 | 仮のホスト `v2.assift.com` / `admin-v2.assift.com` を Vercel の Domains と Gehirn DNS から外す | 024 §6・§10 |
| 11/1 朝 | 10/31 23:20・23:50 の cron の実行履歴が成功 / 旧料金の利用者の請求書を Dashboard で突き合わせ、救った 47 件の支払い失敗の数を見る | 019 §8.3-5 |
| 11/2〜11/6 | Deploy to production を 024 §4.8 の手順で確かめてからオンにする（§3-8） | 024 §4.8 |
| 11/6 ごろ | Heroku を止める（§3-10）。止める前に、ダンプと `<dir>` の保管（暗号化して 1 か所。ファイル名に消す日）が済んでいることを確かめる（021 §10-8）。Heroku に残る 2019〜2025 年の手動バックアップ 8 件はアドオンごと消す（021 §15 の申し送り。保管の決まりの外）| 001 §5.4-6・021 §15 |
| 11/1 以降 | 当夜に作った A（`assift.com.`）と CNAME（`admin`）の TTL を 3600 に戻す | §6.3 |
| Heroku を止めたあと | Gehirn の SPF（`assift.com.` の TXT）から `a:www2298.sakura.ne.jp` を外す（`include:spf.mta.gis.gehirn.jp`・`include:_spf.google.com` は残す）/ v1 の SendGrid の CNAME 5 つ（`9287784`・`em2978`・`s1._domainkey`・`s2._domainkey`・`url2241`）を消す。`google-site-verification` の TXT は残す（Search Console。024 §9 2026-10-15 のブランドの確認で使った） | 016-terms §7・024 §9 2026-10-14 |
| 2027-01-30 | pg_dump と JSONL を消す（カットオーバーから 3 か月） | 021 §10-8(a) |
| 2027-10-30 | `manifest.json` / `report.json` / Stripe の結果 CSV / 旧料金の対象者の一覧 / `usage_records` の CSV を消す。`/serviceworker.js`（§8）を消してよい | 021 §10-8(b) |
| リリース後 | PITR の検討 / 共同開発者が増えたら Redirect URLs の `assift-*-sundbox.vercel.app` を見直す | 024 §10 |

保管物のファイル名に消す日を入れる（021 §10-8）。

## 7. `npm run stripe:sync-all`（§3-4）

### 7.1 作るもの

- `scripts/stripe/sync-all.ts`: `syncAllSubscriptions()`（`lib/billing/sync.ts`）を 1 回呼び、`{ synced, failed }` と所要の秒数を出す。`failed > 0` か例外なら終了コード 1。
  最初に接続先を 1 行出す（`接続先: Supabase <ホスト> / Stripe <live | test | 不明>`。鍵の値は出さない）。シェルに残った別の環境の値で流しても `failed: 0` で通ってしまうため（§6.3 23:25）。
  食い違い（live の鍵とローカルの URL など）で止めることまではしない（2026-10-16 に決定。表示だけ）
- `package.json`: `"stripe:sync-all": "tsx --conditions=react-server scripts/stripe/sync-all.ts"`（`server-only` を通すため、`stripe:migrate-v1` と同じ形）
- 必要な環境変数: `STRIPE_SECRET_KEY`・`NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_SECRET_KEY`。無ければ何もせずに止まる。値はコマンドごとに渡し、`.env.local` に書かない
- 人数の送信（`reportAllUsage`）は呼ばない。当日に新料金の契約は無く、送るものが無い

### 7.2 気を付けること

- 本番の `SUPABASE_SECRET_KEY` を手元で使う。`createPrivilegedClient()` の用途（ジョブ）の範囲で、中のクエリは `syncAllSubscriptions()` のまま 1 人ずつに絞られている
- Stripe の鍵は、Vercel に入れる制限付きキー（019 §4.1）で足りる（Subscriptions / Customers / Prices の読み取り、Customer のメールの更新、二重契約の解約）。どの鍵を使うかは Stripe の live のタスクで決める

### 7.3 確かめ方

- `lint` / `typecheck` / `test`
- ローカルの Supabase と Stripe のサンドボックス（`sk_test_`。019 §9 の確認と同じ鍵）で流し、`billing_subscriptions` が埋まる。
  **Customer はテストクロックを付けずに API で作る**（2026-10-16 に Checkout から変えた）。price で絞った Subscription の一覧は、`test_clock` か `customer` を指定しないと
  テストクロック付きの契約を返さない。019 の `scripts/stripe/verify/` のクロック付きの契約で流すと、一覧の経路を通らずに「有効なのに一覧に無い → 1 件ずつ取り直す」経路で写り、確かめたことにならない。
  当夜の 392 件はすべて旧 price（`stripe:migrate-v1` で schedule とクーポンを付けたもの）なので、それを含めて次の 3 人で見る（確認用の一時スクリプトはコミットしない。結果は §12）:
  - 旧料金: v1 相当の契約（acacia・`freemium-monthly`）に `stripe:migrate-v1 -- --apply` を流し、移行と同じく `profiles.stripe_customer_id` だけを写す（同期はしない）→ sync-all で行ができる
  - 新料金: Checkout と同じ中身の契約を `syncCustomer()` で写してから、**その行を消して** sync-all を流し、行ができ直す
  - 解約の Webhook を落とした人: 写しは有効のまま、Stripe で解約する → sync-all で `canceled` に直る

## 8. v1 の Service Worker を解除する `/serviceworker.js`（§3-7）

### 8.1 v1 の Service Worker（`tabbyz/assift-v1` の `app/assets/javascripts/serviceworker.js.erb`）

- `/serviceworker.js` を **scope `'./'`（登録したページからの相対）**で登録する（`serviceworker-companion.js`。`serviceworker-rails`）。そのため登録は `/`・`/share/`・`/tenants/<token>/` などページの場所ごとに分かれうる。どれもスクリプトは同じ `/serviceworker.js`
- `fetch` はネットワーク優先で、失敗したらキャッシュ（`application.css`・`/offline.html`）を返す。キャッシュ名は `v1:sw-cache-`
- ブラウザは画面の遷移ごとに `/serviceworker.js` を取り直す（HTTP キャッシュは最大 24 時間で迂回）。v2 では 404 になるが、**取り直しの失敗では登録は消えない**。そのため v1 を使っていた人は、v2 のすべてのリクエストが v1 の Service Worker を通る状態が続く

### 8.2 作るもの

- Route Handler `src/app/serviceworker.js/route.ts`（GET。ドット入りのフォルダでパスを作るのは Next の規約どおり: `node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md` の `app/rss.xml/route.ts`）: 次の JS を返す。`Content-Type: text/javascript; charset=utf-8`・`Cache-Control: no-cache`
  - **`install` の中で** `self.registration.unregister()` を呼び（`waitUntil` で待たない）、`caches.keys()` をすべて消す（こちらは `waitUntil`）。scope ごとの登録がそれぞれ取り直して、それぞれ自分を解除する
  - 有効化（`skipWaiting()` → `activate`）を経ない。当初の案（`install` で `skipWaiting()`、`activate` で消して解除）は、Chrome が古い Service Worker の中継中のリクエストを待って有効化を止め、その間の画面の移動が止まった（§12 2026-10-16。6 回中 3 回）。
    `unregister()` を `waitUntil` で待たないのは、解除の処理が install の処理の終わりを順番待ちするため（待つと互いに待ち合う）
  - `fetch` のハンドラは持たない（リクエストを中継しない）
  - 開いている画面は再読み込みしない（Server Action の途中で画面を飛ばさない）。その画面は閉じるまで古い Service Worker が中継し、次の遷移から素のネットワークになる
- proxy の matcher は変えない（ふつうのパスとして通り、CSP のヘッダも付く。この JS は `eval` も外部の読み込みもしないので方針に触れない）。管理画面のホストでは proxy の 0 段目が `/-` へ redirect する（`lib/admin/host.ts` の `redirectToAdmin`。v1 に管理画面のホストは無かったので要らない）
- 置いておく期間は 1 年（§6.6）。解除済みの人には何も起きないので、消し忘れても害はない
- AGENTS.md のディレクトリに 1 行足す
- `www` は扱わない: v1 は apex だけで動いていた（Gehirn に `www` のレコードが無い。§3-14）。仮に `www` を apex へ転送すると、そこに残った登録は解除できない（Service Worker のスクリプトの取得は redirect を受けない）

### 8.3 確かめ方

1. 同じ origin と port で 2 段に分ける（v2 のページから `register()` を呼ぶと CSP に止められるため）。Playwright の永続プロファイルで:
   1. CSP の無い小さなサーバーで、v1 と同じ中身の `/serviceworker.js`（`tabbyz/assift-v1` `a8bb5ad` の `serviceworker.js.erb`。ERB の `asset_path` は `/application.css` に置き換え、それと `/offline.html` も配る。`cache.addAll` が 1 つでも 404 だと install に失敗する）と、
      `register('/serviceworker.js', { scope: './' })` を呼ぶページを **`/`・`/share/x`・`/tenants/<22 文字>/shifts`** に配り、scope `/`・`/share/`・`/tenants/<22 文字>/` の登録 3 つとキャッシュ `v1:sw-cache-` を作る。
      ページが v1 の Service Worker に制御されている（`navigator.serviceWorker.controller` がある）ことも見る（前提が作れていないと確かめにならない）。
      URL は v1 の実際の形（`share/:code`・`/tenants/<token>/shifts`。v1 `config/routes.rb`）に合わせる。`scope: './'` は最後の `/` までなので、末尾に `/` のある `/share/x/` にすると scope が `/share/x/` になり、v2 は `/share/x` へ 308 して着いた先が scope の外になる
   2. サーバーを止め、同じ port で `npm run build && npm run start` に入れ替え、同じ 3 つの URL を開き直す（`/tenants/<22 文字>/shifts` は v2 の 308 で移るが、最初のリクエストは scope の中なので取り直しが走る。必要なら `registration.update()` を待つ）
   3. `navigator.serviceWorker.getRegistrations()` が空、`caches.keys()` が空、v2 のページで `securitypolicyviolation` が 0 件
   - 但し書き: v2 で開かれない scope（例: 開かなくなった `/tenants/<token>/`）の登録は、その URL を開くまで残る。v2 のページはどれもその scope の外なので、何も中継せず害は無い
   - 確かめのスクリプトはリポジトリに入れない（scratchpad だけ。1 回きりの確認。005 と同じ）。手順と結果を §12 に書く
2. `v2.assift.com` に出たあと `curl -sI https://v2.assift.com/serviceworker.js` で `Content-Type`・`Cache-Control`
3. 当日: v1 を開いた（Service Worker が登録されている）ブラウザで `assift.com` を開き、DevTools の Application → Service Workers から消えること（§6.5-8）。
   最初に開いたタブは閉じるまで古い Service Worker が中継する（§8.2）ので、数秒待ってから**タブを閉じて開き直し**て見る

## 9. 申し送りの取り込み

| 元 | 内容 | 本プラン |
| --- | --- | --- |
| 001 §5.4 | カットオーバー手順 1〜6（2 の「メンテナンス時間・再ログインが必要な旨」の告知を含む） | §6・§6.6（Heroku の保持は §3-10）・§4-5 |
| 016-terms §7 2026-10-13（連絡先） | Web のレコードだけ切り替える / v1 を止めたら SPF から sakura を外す / Resend はサブドメイン | §6.3・§6.6 |
| 016-terms §7 2026-10-13（制定日）・（周知）の表 | 日付をまたいだら 10/31 に直す / 10/31 から適用にする | §3-2 で上書き |
| 021 §6.1 | 移行しない人の Subscription（`v1-subscriptions-not-migrated.csv`）を Dashboard で解約 | §6.2・§6.3 |
| 021 §8.2-8・8b / §15 | 実際の Google ログイン / パスワードを持たない人の案内 / 準備中の店舗 1,845 件 | §6.2（22:52）・§4-5 |
| 019 §8.2.3・§8.3 | スクリプトの流し方・順序・Dashboard の切り替え | §6.3 |
| 021 §10 | 当日の手順 1〜8 | §6（§10-3 の `--rollback` と 23 時台は §3-3・§3-5 で上書き。§10-5 の Webhook は §3-11・§3-12） |
| 021 §15（022 への申し送り） | Heroku のメンテナンス枠・自動バックアップ・古い手動バックアップ・所要の見込み | §3-1・§6.1・§6.6 |
| 024 §6 | 当日に差し替える値 | §6.3 の DNS の切り替えの順 |
| 024 §10 | Site URL を変えたら Redeploy して残るか見る / Deploy to production / Webhook の URL / 解析 / 同意画面 / 仮のホスト / SendGrid / PITR | §3-8・§3-11・§6.3・§6.5・§6.6 |
| 025 §6.3 | `assift.com` で 1 件届く | §6.5-9 |

元のプランには「026 へ移した」と注記する（§10）。

## 10. ファイル

| ファイル | 変更 |
| --- | --- |
| `docs/plans/026-cutover/README.md` | 本プラン |
| `scripts/stripe/sync-all.ts` / `package.json` | §7 |
| `src/app/serviceworker.js/route.ts` | §8 |
| `scripts/migrate-v1/undo.sql` | §14 |
| `AGENTS.md` | ディレクトリ（`scripts/stripe/` に sync-all、`app/serviceworker.js/`、`scripts/migrate-v1/` に undo） |
| `docs/plans/016-terms/README.md` | §7 2026-10-13（制定日）の「10/31 に直す」と（周知）の表の「10/31 にする」に「026 §3-2 で上書き」、（連絡先）の「カットオーバーのときにすること」に「026 へ移した」 |
| `docs/plans/021-data-migration/README.md` | §10 の冒頭に「026 §6 が当日の手順。§10-3 は 026 §3-3・§3-5 で上書き」。§6.1 の「022 の手順に入れる」を 026 に読み替え |
| `docs/plans/024-production/README.md` | §6・§10 の「カットオーバー」の行に「026 へ移した」 |
| `docs/plans/001-phase1-architecture/README.md` | §5.4 に「当日の手順は 026」 |
| `docs/plans/019-billing/README.md` | §8.3 に「当日の順序は 026 §6.3」、§12 2026-10-08 の「請求書の扱い」に「026 §6.3 23:30 で見る」 |
| `docs/plans/025-analytics/README.md` | §6.3 に「026 §6.5-9」 |

## 11. 未確定

| # | 項目 | 状態 |
| --- | --- | --- |
| 1 | ~~Gehirn DNS の Web のレコードの今の値と TTL・`www`~~ | 決定（2026-10-15）: 値は §12、`www` は作らない（§3-14） |
| 2 | §6 の各段の時刻・判断点 A の時刻 | §4-1（021 §9.3）の実測で埋める |
| 3 | `stripe:sync-all` と `stripe:migrate-v1` に使う Stripe の鍵 | Stripe の live のタスクで決める（§7.2）。019 §4.1 のとおり、移行スクリプトは Vercel の制限付きキーとは別の鍵で流す（schedule・請求書の確定と無効化の権限が要る） |
| 4 | ~~当夜に「移行しないのに店舗を持つ人」が 1 件以上出たとき~~ | 決定（2026-10-15）: §3-13 |
| 5 | Stripe の段（dry-run + `--apply`）が 25 分に収まらないとき | §5 の実測で決め、**10/29 の告知の前の判断（§4）までに決める**。案: (a) 開始を早める（例: 21:30）/ (b) 10/29 までに、即時解約する `unpaid`（87 件）の古い下書きの無効化だけ先に流す（v1 の利用者には請求されていない下書き。019 §8.2.2。区分を絞る引数が無いのでスクリプトの変更が要る。手元から流すだけのスクリプトなので、§5 の merge の停止の例外にする）/ (c) 公開を 24:00 より後にずらす（§3-2 で日付は 10/30 のまま出せる） |

## 12. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）

### 2026-10-16（§14 `scripts/migrate-v1/undo.sql` の実装とローカルでの確かめ）

`scripts/migrate-v1/undo.sql` と AGENTS.md のディレクトリを足した（§14.3・§14.6）。クラウドのセッションのローカルの Supabase（Postgres 17.6。`postgres` は `rolsuper=f`・`rolbypassrls=t`）で確かめた。

**通し（§14.5-1〜5）:** `db reset` → seed の管理用以外（dev）を消す → fixtures を scratchpad に写して `migrate:v1`（COMMIT。入れた 6 人）→ 移した 1 人に `google` の identity・セッション・refresh token を足す（22:52 相当）。

| 項目 | 結果 |
| --- | --- |
| 確認だけ | 安全装置を通り、TRUNCATE が 10 表に連鎖（NOTICE）、`DELETE 6`、14 表の件数が出て ROLLBACK。DB は変わらない。終了コード 0 |
| COMMIT | 14 表の件数が `report.json` の `before` と一致。`auth.sessions`・`refresh_tokens`・`mfa_amr_claims`・`one_time_tokens` も 0 |
| 再インポート | `--allow-existing` なしで `既存: auth.users 1 件 / tenants 0 件` → COMMIT、`migrate:v1:verify` が「すべて一致」。もう一度片付けて同じ結果 |
| 本番での空振りの形 | 管理用アカウントだけの状態で `expected_users=0` → 安全装置を通り（消す人 0 人）、ROLLBACK |

**安全装置（§14.5-6）:** どれも何も消さずに止まり、終了コードは 3（`ON_ERROR_STOP`）。

| 外したもの | 結果 |
| --- | --- |
| `expected_users` なし | `expected_users がありません。…` |
| G4（`expected_users` を 1 ずらす） | `G4: 管理用以外の auth.users が 6 人です（expected_users = 5）` |
| G1（管理者 2 人 / 0 人） | `G1: is_admin の人が 2 人です` / `0 人です` |
| G2（`billing_subscriptions` に 1 行） | `G2: billing_subscriptions に行があります。…` |
| G3（管理用アカウントに店舗） | `G3: 管理用アカウントが店舗を持っています` |
| G0（BYPASSRLS の無いロールに `set role`） | `G0: undo_nobypass は RLS を迂回できません（BYPASSRLS が要る）` |
| `-v commit=0` / `-v commit=abc` | どちらも ROLLBACK（`abc` は psql が真偽値として読めず、偽として扱う）。終了コード 0 |
| 読み取り専用（`alter database postgres set default_transaction_read_only = on`） | 素の DELETE は `cannot execute DELETE in a read-only transaction`、`undo.sql` は `begin read write` で COMMIT まで通った。設定は戻した |

**規模の計測（§14.5-7）:** 合成データ（`users` 29,010・`tenants` 27,609・`staffs` 160,272・`patterns` 167,253・`shifts` 11,496,340・`required_nums` 358,507・`restrictions` 10,144・`date_notes` 157,025・`shares` 57,978・`staff_patterns` 480,816・`staff_default_patterns` 160,272・`staff_count_history` 29,010。DB 3,856 MB）。
計算機は 4 コア・メモリ 15 GB のコンテナ。作る SQL は scratchpad だけ（`shifts` の INSERT は 8 分 54 秒）。

| | 所要 | WAL | DB の大きさ | ディスク |
| --- | ---: | ---: | --- | --- |
| (a) 比較: `delete from auth.users`（cascade）だけ。ROLLBACK | **56 秒** | **2,686 MB** | 3,856 MB のまま（COMMIT しても VACUUM まで空かない） | — |
| (b) 本命: `undo.sql`（COMMIT） | **5.4 秒**（安全装置 0.03 秒・TRUNCATE 0.01 秒・DELETE 29,010 人 2.1 秒・COMMIT 3.1 秒） | **29 MB** | 3,856 MB → **49 MB** | すぐに約 4 GB 空いた |

- 本番は計算機と Session pooler 越しの往復で違うが、(b) の大半は行数によらない（TRUNCATE とファイルの削除）。行数に比例するのは 2.9 万人の DELETE だけなので、当夜も分の単位には届かない見込み。(a) との差は時間より WAL とディスクで、ディスクを理由に中止した夜に (a) は使えない（§14.2-1 の判断どおり）
- 14 表の件数の並びが `union all` の順にならなかったので、`order by` を付けた（`report.json` の `before` と同じ並び）
- 管理用アカウントの `staff_count_history` が 1 行残った回があった。G3 の確かめで管理用アカウントに店舗を作って消したときに、店舗の削除のトリガ（`record_tenant_delete`）が書いたもの。本番では起きず、確かめは管理用以外の行だけを見るので影響しない

**確認:** lint（既存の警告 1 件のみ）/ typecheck（このコンテナの `node_modules` が古く `@vercel/analytics` が無かったので `npm ci` してから）/ test（924 件）/ `npx supabase test db`（241 件）。最後に `db reset` で seed の状態に戻した。
残り: 本番での空振り（§14.5。021 §9.3 の予行の日。人の作業）

**実装のレビュー**（別の担当にローカルで流し直させた。**1 回目で高・中 0 件**）: 通し・安全装置（G0 は `PGOPTIONS='-c role=authenticated'`）・再インポートを再現。
引数の誤り（`-v expected_users=`・`=6.0` は終了コード 3、`-v commit=`・値なし・`off`・`no`・`-v COMMIT=1` はどれも ROLLBACK）で COMMIT に進む組み合わせは無かった。
低 1 件: 22:52 の Google ログインが自動リンクされず自分のメールの新しいユーザーができると、いちばん起こりそうな中止の場面で G4 で止まる → §14.4「通らなかったとき」に、それを確かめたら `expected_users=<N+1>` で流してよいと足した（SQL は変えない）。手順書の判断点 A にも足した

**コードレビュー**（利用者の依頼。`/code-review` で `main...HEAD` を見た。手元の `main` が古く、すでに main に入った別の変更（rake・`ignore-build.sh`・解析・proxy）への指摘 4 件も混ざったので、本タスクの範囲の 3 件だけを扱った）:

| 回 | 指摘 | 対応 |
| --- | --- | --- |
| 1 | `auth.refresh_tokens` は `user_id`（文字列）に外部キーが無く、`session_id` が null の行は cascade で残る。確かめも `auth.identities` しか見ていない | 先に `delete from auth.refresh_tokens where user_id is distinct from <管理用>` を足し、確かめに `sessions`・`refresh_tokens`・`mfa_factors`・`one_time_tokens` を足した。ローカルで `session_id` が null の token（消える）・セッション付きの token（cascade で消える）・管理用アカウントの token（残る）を作って確かめ、再インポートと verify も通った |
| 1 | 確かめの表の一覧が手書きで、`tenants` を参照する表を足すと確かめから漏れる | `pg_constraint` から `tenants` を参照する表を引く形にした（今は 10 表 + `tenants` + `billing_subscriptions`）。件数の出力は `import.ts` の `TARGET_TABLES` と同じ 14 表のまま（`report.json` の `before` と見比べるため）とコメントに書いた |
| 1 | G2 は 23:05〜最初の写しのあいだを止められない（`-v before_point_b=yes` のような明示を求めては） | 見送った。プランのレビュー（§13「§14 の 1 回目」#3）で決めたとおり、手順書のコマンドに書けば毎回同じ文字を打つだけになり、確かめにならない。B の前かは §14.4-1 で人が確かめる（23:05 の Webhook の有効化と `--limit 5` の前）。§14.1 に止められない区間を書いてある |
