# 026: カットオーバー（v1 → v2 の切り替え。当日の手順書）

- 前提: 001 §5.4（カットオーバー手順）/ 016-terms §7 2026-10-13（制定日・連絡先・DNS・告知）/ 019 §8（v1 からの引き継ぎ。§8.2.3 スクリプトの流し方・§8.3 順序）/
  020 §10（管理画面のホスト）/ 021 §9.3（本番に対する予行）・§10（カットオーバーでの位置）・§15（リハーサルの所要と申し送り）/
  024 §4.8（Deploy to production の確かめ方）・§6（当日に差し替える値）・§10（申し送り）/ 025 §6.3（解析の当日の確認）
- 番号: 021 の「022（カットオーバー）」・024 の「カットオーバーのプラン」が本プラン。025 はアクセス解析に使ったので **026**
- 日時: **2026-10-30（金）22:00 開始、24:00 までに公開**（= DNS の切り替えを終える）。作業は利用者の手元の Mac（Postgres 16 と v1 の環境がある。021 §15）、
  クラウドのセッションが手順と記録を伴走する
- 予定: プランは 10/15〜10/16（クリティカルパス）。コードの変更（§7・§8）は 10/27 までに main へ
- **作業するのは人間**（Heroku / Stripe / Vercel / Supabase / Google / Gehirn の操作と秘密の値）。リポジトリの変更は §7・§8 の 2 つだけ

**状態: プラン確定（2026-10-16）。§3 の決定を入れ、レビューを 6 回行って収束した（§13。6 回目は高・中 0 件）。DNS の今の値は §12。未確定は §11（実測で埋めるものと Stripe の鍵）。**

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
| 1 | 021 §9.3 の本番に対する `--rollback` が通り、所要時間が分かっている。必要なら `COPY` に替えた（021 §13-8） | 10/22 | 021 §15 に所要・RSS・§13-4（`postgres` ロールの権限）の結果。§6 の時刻を実測で埋めた | 021 §9.3 |
| 2 | Stripe の live: `stripe:setup` と移行用の鍵（§11-3）は **10/22 まで**（§5 の 10/23 の計測の前提）、Webhook の登録（§3-11 の URL）、Dashboard の設定（019 §4.1）、**解約メールのオフ**（019 §8.3-2）、Vercel の Production に `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `CRON_SECRET` | 10/27 | 019 の実装ログ。`CRON_SECRET` は鍵付きで `curl -i -H "Authorization: Bearer …" https://v2.assift.com/api/cron/billing-usage` が 200（鍵が無くても 401 になるので、鍵なしの 401 では確かめられない）。Webhook のエンドポイントは API の版を `2026-09-30.endive` で登録する（019 §12 2026-10-08。アカウントの既定は古い版）。`STRIPE_WEBHOOK_SECRET` は Stripe のテストイベントの送信が **400 にならない**こと（400 は署名が合わない。処理しない種類は 204、架空の Customer の処理する種類は 500 になりうるので、2xx を基準にしない。`api/stripe/webhook/route.ts`） | Stripe の live |
| 3 | `stripe:sync-all`（§7）と `/serviceworker.js`（§8）が main に入った | 10/27 | §7 はローカルの Supabase とサンドボックスで（§7.3）、§8 は手元と `v2.assift.com` で（§8.3） | 本プラン |
| 4 | 3 ページの最終レビューが済み、文面が確定した | 10/28 | 016-terms §7 | 規約 |
| 5 | 告知を送った（10/29。規約・ポリシーの全文の PDF を添付、「10/30 から適用」）。本文に入れる申し送り: メンテナンスの時間（10/30 22:00〜）と、切り替え後は再ログインが要ること（001 §5.4-2）/ パスワードを持たない人（Google だけで使っていた人・代理承認の人）は「パスワードを忘れた方」から作る（021 §8.2-8b）/ スタッフ 0 人でデータのある店舗 1,845 件は初期設定の画面から始まる（021 §15。触れるかは告知のタスクで決める）/ 料金（019 §8.4）/ 規約の周知（016-terms §7） | 10/29 | 送った日時・件数・添付の版の記録（016-terms §7 2026-10-13） | 告知 |
| 6 | 当日の昼の予行（§5 T-0）が通った | 10/30 12:00 | 所要が 021 §9.3 の実測から大きく外れていない | 本プラン |

## 5. 事前の作業

| いつ | すること | メモ |
| --- | --- | --- |
| §4-1 のあと | §6 の各段の時刻と、中止の判断の時刻（§6.4）を実測で埋める | ローカルの実測: capture 52 秒 / download 1〜2 分 / restore 1 分 17 秒 / エクスポート 13 分 37 秒 / インポート 17 分（021 §15） |
| 10/23 まで | **前提: live で `stripe:setup` が済み（price `assift_monthly` とクーポン `assift_v1_legacy` が無いとスクリプトは最初に止まる）、移行用の鍵（§11-3）ができていること**。`stripe:migrate-v1` の dry-run をリハーサルの `v1-subscriptions.csv` で live に流し、所要を測る（読むだけで書かない。`--output ~/v1-export/<リハーサルの dir>/v1-subscriptions-dryrun.csv` を付ける。既定ではリポジトリの直下にメール入りの CSV を書く）。`--apply` の所要は区分ごとの呼び出しの回数（`unpaid` は溜まった下書きの数 × 3 回など。dry-run の結果 CSV の `actions` から数える）から見積もり、§6.3 の時刻に入れる。**dry-run と `--apply` の合計が 25 分を超える見込みなら、§11-5 で開始の時刻か事前の処理を決め直す** | 約 989 件を 1 件ずつ順に処理し、区分を絞る引数は無い。`unpaid` の 134 件は毎月の下書きが溜まっている（019 §8.2.1）。判断点 B の後に時間が足りなくなると戻せない |
| §4-1 のあと | 中止のときの片付けの SQL（COMMIT した後に v1 へ戻す場合。§6.4）を書き、ローカルで通す | 管理用アカウント以外の `auth.users` を消して `profiles` 以下を cascade で消す想定。`shifts` 1,150 万行の削除の所要も測る |
| 10/27 まで | §7・§8 を main に入れ、`v2.assift.com` で確かめる | §4-3 |
| 10/27 以降 | **main への merge を止める**（直しが要るものだけ。merge すると Production が自動でデプロイされる）。3 ページの文面の修正（§4-4）は例外 | 当日の本番のコードを固定する |
| 10/29（前日） | Gehirn DNS の今の値（§12 2026-10-15）から変わっていないか見る | apex の A は Heroku へのエイリアス（ALIAS）で、TTL の欄が無い（参照先の TTL に従う）ので、前もって下げる手順は要らない。当夜に作る A と CNAME は TTL 300 で作り、落ち着いたら 3600 に戻す（§6.6） |
| 10/29 | `npx supabase migration list` で本番の migration が main と揃っている（Local と Remote が同じ本数） | Deploy to production はオフ（§3-8）なので、merge した migration は `db push` で手で入れる（024 §3-10） |
| 10/29 | v1 の管理画面で、旧料金に移す契約の今月の売上の値を控える | 019 §8.2.3-1 の「392 件の請求見込みが v1 の売上と大きく違わない」の突き合わせ用。当夜は v1 に管理者でログインしない（§3-10） |
| 10/29 | 当日の手元の準備: `mkdir -p ~/v1-export/dumps ~/v1-export/noon-20261030`（`download -o` は親のフォルダを作らない見込み）/ v1 の作業ディレクトリ（`a8bb5ad`）に最新の `v2_export.rake`（照合を絞った版。`ecfc533` 以降）を写す / Postgres 16（port 5433）/ v2 の作業ディレクトリを最新の `main` にして `npm ci` / 秘密の値（DB の接続文字列・`SUPABASE_SECRET_KEY`・Stripe の鍵）がパスワードマネージャから出せる | 秘密の値は `.env.local` に書かない。コマンドごとに環境変数で渡す（021 §11）。v1 の起動には `DATABASE_URL=postgres://$(whoami)@localhost:5433/<名前>` とダミーの `STRIPE_SECRET_KEY` が要る（021 §15「v1 をつなぐ」） |
| 10/30 昼（T-0）**11:00 までに開始** | 昼の予行（約 50 分。v1 は止めない）: `heroku pg:backups:capture` → `download -o ~/v1-export/dumps/<backup id>.dump` → 手元に restore（`createdb -p 5433 assift_v1_noon` → `pg_restore -p 5433 -d assift_v1_noon --no-owner --no-acl -j 4 ~/v1-export/dumps/<昼の backup id>.dump` → `vacuumdb -p 5433 --analyze-only assift_v1_noon`）→ `DATABASE_URL=postgres://$(whoami)@localhost:5433/assift_v1_noon STRIPE_SECRET_KEY=<ダミー> bundle exec rails "v2:export[$HOME/v1-export,<dumped_at>]"`（`DATABASE_URL` を必ずこの行で渡す。v1 の development の既定や、シェルに残ったリハーサルの値で古いデータを書き出さない）→ `NODE_OPTIONS=--max-old-space-size=16384 MIGRATION_DATABASE_URL='<Session pooler>' npm run migrate:v1 -- --input <昼の dir> --rollback` を本番に流す → 続けて `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <昼の dir>/v1-subscriptions.csv --output <昼の dir>/v1-subscriptions-dryrun.csv`（読むだけ）→ **dry-run の CSV と `report.json` を `~/v1-export/noon-20261030/` へ写す**（夜の 23:00 の比べる相手と、`max_staffs_count` を入れる人の候補。22:06 の削除の対象外）。`<昼の dir>` は昼の rake の `exported to …`、`<dumped_at>` は昼のバックアップの Started（22:02 と同じ取り方）。`report.json` の「移行しないのに店舗を持つ人」が 0 件か、変換で止まらないか、dry-run の突合（§6.3 23:00 の確認）が通るかを見る。前後で本番の Supabase の Disk の使用量を見る | §3-3。ネットワーク・権限・所要・データの最終確認（021 §9.3「当日の朝にもう 1 回」）。dry-run の突合を昼に済ませておき、夜は昼との差分だけを見る。1 件以上なら `--overrides` のファイルを `~/v1-export/overrides-20261030.json`（22:06 の削除の対象の外）に用意する（§3-13）。昼のダンプ・DB・出力のフォルダは夜の 22:06 にまとめて消す（個人情報を含む。`noon-20261030/` は 23:10 の後に消す）。`--rollback` は全行を入れてから戻すので、不要な行と WAL がディスクに残る |
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
| 23:10 | `STRIPE_SECRET_KEY='<移行用の鍵>' npm run stripe:migrate-v1 -- --input <dir>/v1-subscriptions.csv --apply --output <dir>/v1-subscriptions-apply.csv`（残り全部。所要は §5 の見積もり） | 結果の CSV は 3 つとも `<dir>` に残す（`--output` を省くと作業ディレクトリの同じ名前に上書きされ、個人情報が repo の下に残る）。済んだら `~/v1-export/noon-20261030/` を消す | 019 §8.2.3-3・4 |
| 23:25 | `STRIPE_SECRET_KEY='<鍵>' NEXT_PUBLIC_SUPABASE_URL=https://assift.supabase.co SUPABASE_SECRET_KEY='<本番の secret key>' npm run stripe:sync-all`（§7。tsx は `.env*` を読まない。シェルにローカルの値が残っているとローカルを同期して `failed: 0` で通ってしまうので、3 つとも必ずこの行で渡す） | `failed: 0`。`billing_subscriptions` の件数。旧料金に移した人を 1 人、`v2.assift.com` でロックされていないこと | 019 §8.3-4・§3-4 |
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
| COMMIT の後の検証で失敗（判断点 A の前） | 直せるなら直す。戻すなら §5 の片付けの SQL で管理用アカウントだけの状態に戻し、Heroku `MAINTENANCE_MODE=off`・Scheduler のジョブを控えた値で戻す（以下「日を改めたとき」も）。**Webhook のエンドポイントと Cron Jobs は、片付けが終わり `profiles` が管理用アカウントの 1 行だけになったのを確かめてから戻す**（残っているうちに戻すと、v1 の Customer のイベントや同期で `syncCustomer()` が持ち主を引き、Stripe に書く。`lib/billing/sync.ts` の `applySubscriptions`） |
| 判断点 B の後 | v1 には戻さない。前に進めて直す（当夜に作るレコードは TTL 300 なので、直したレコードは早く反映される） |
| 日を改めたとき | v1 を戻す（`MAINTENANCE_MODE=off`・Scheduler のジョブ）。3 ページの日付と告知をやり直す（§3-2a）。Vercel の Cron Jobs と Stripe の Webhook のエンドポイントを戻す。Stripe の解約メールの設定を戻すかを決める |

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

- `scripts/stripe/sync-all.ts`: `syncAllSubscriptions()`（`lib/billing/sync.ts`）を 1 回呼び、`{ synced, failed }` を出す。`failed > 0` なら終了コード 1
- `package.json`: `"stripe:sync-all": "tsx --conditions=react-server scripts/stripe/sync-all.ts"`（`server-only` を通すため、`stripe:migrate-v1` と同じ形）
- 必要な環境変数: `STRIPE_SECRET_KEY`・`NEXT_PUBLIC_SUPABASE_URL`・`SUPABASE_SECRET_KEY`。無ければ何もせずに止まる。値はコマンドごとに渡し、`.env.local` に書かない
- 人数の送信（`reportAllUsage`）は呼ばない。当日に新料金の契約は無く、送るものが無い

### 7.2 気を付けること

- 本番の `SUPABASE_SECRET_KEY` を手元で使う。`createPrivilegedClient()` の用途（ジョブ）の範囲で、中のクエリは `syncAllSubscriptions()` のまま 1 人ずつに絞られている
- Stripe の鍵は、Vercel に入れる制限付きキー（019 §4.1）で足りる（Subscriptions / Customers / Prices の読み取り、Customer のメールの更新、二重契約の解約）。どの鍵を使うかは Stripe の live のタスクで決める

### 7.3 確かめ方

- `lint` / `typecheck` / `test`
- ローカルの Supabase と Stripe のサンドボックス（`sk_test_`。019 §9 の確認と同じ鍵）で流し、`billing_subscriptions` が埋まる。
  前提: ローカルの `profiles.stripe_customer_id` がサンドボックスの Customer を指している（先にローカルで Checkout から申し込む）。指していないと何も写らず `synced: 0` で終わり、確かめたことにならない。
  申し込みから戻った時点で `syncCustomer()` が写しているので、**その `billing_subscriptions` の行を消してから** sync-all を流し、行ができ直すことを見る

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
3. 当日: v1 を開いた（Service Worker が登録されている）ブラウザで `assift.com` を開き、DevTools の Application → Service Workers から消えること（§6.5-8）

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
| `AGENTS.md` | ディレクトリ（`scripts/stripe/` に sync-all、`app/serviceworker.js/`） |
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

### 2026-10-16（§8 `/serviceworker.js` の実装と手元の確かめ）

`src/app/serviceworker.js/route.ts` を足した（§8.2）。`npm run build` で `ƒ /serviceworker.js`（動的）。
`curl -sI` で `200`・`Content-Type: text/javascript; charset=utf-8`・`Cache-Control: no-cache`・`Content-Security-Policy` あり。

§8.3-1 の 2 段の確かめ（Playwright 1.56 の Chromium headless・永続プロファイル。ローカルの Supabase + `next build && next start`）:

- 1 段目: v1 役のサーバー（CSP なし。v1 `a8bb5ad` の `serviceworker.js.erb` の ERB を値にしたもの。`<%#= … %>` は v1 でも空文字なので `''`）で `/`・`/share/x`・`/tenants/FixtureTenant00000001A/shifts` を開き、
  scope `/`・`/share/`・`/tenants/FixtureTenant00000001A/` の登録 3 つ、キャッシュ `v1:sw-cache-`、3 画面とも v1 の Service Worker の制御下、を作った
- 2 段目: 同じ port を v2 に入れ替えて同じ 3 つを開く（`/tenants/…` は 308 → `/login`）→ 5 秒後に `getRegistrations()` が空・`caches.keys()` が空 →
  `/` を開き直すと `navigator.serviceWorker.controller` が null（素のネットワーク）。`securitypolicyviolation`・コンソールの `Refused to` は 0 件
- **最初の書き方（`install` で `skipWaiting()`、`activate` の `waitUntil` でキャッシュを消して `unregister()`）は 6 回中 3 回失敗した。**
  scope `/` の新しい Service Worker が `installed` のまま有効にならず、古い v1 の Service Worker が残り、その間の `/` への移動が 15 秒以上止まった（`getRegistrations()` も返らない）。
  ブラウザを起動し直すと消えていた。Chrome は、古い Service Worker が中継中のリクエスト（v2 の LP が出す 370 件ほどのフォントの先読み・RSC のプリフェッチ）を抱えているあいだ有効化を待たせるため。
  `unregister()` を `waitUntil` の外に出した書き方も 2 回目で同じように止まったので、有効化の経路そのものが原因と判断した
- そこで **`install` の中で `unregister()`（待たない）とキャッシュの削除**にし、有効化を経ないようにした。同じ確かめを、`/serviceworker.js` だけ差し替える中継越しに 6 回、build した本物で 6 回流し、**12 回とも通った**（scope `/` の登録とキャッシュは 2 段目の 4 秒ほどで消える）
- 確かめのスクリプトは scratchpad に置き、リポジトリには入れていない（§8.3）
- 残り: §8.3-2（merge の後に `v2.assift.com` で `curl -sI`）と §8.3-3（当日。§6.5-8）

### 2026-10-16（§8 の確かめ方の見直し）

実装の前に、§8 を main（`2c595ce`）と v1（`tabbyz/assift-v1` `a8bb5ad`）の実物に突き合わせた。

- v1 の中身は §8.1 のとおり（`serviceworker.js.erb` はネットワーク優先 + キャッシュ・`offline.html`、`serviceworker-companion.js` は `application.coffee` から読まれ全ページで `scope: './'` で登録）
- proxy の 4 段も `next.config.ts` の redirects も `/serviceworker.js` に当たらない（Service Worker のスクリプトの取得は redirect を受けないので必須）。CSP は付くが、この JS は方針に触れない
- §8.3 の確かめのページを `/share/x/` から v1 の実際の URL（`/share/x`・`/tenants/<22 文字>/shifts`）に直した（末尾の `/` で scope が外れる）。開かれない scope の但し書きを足した
- 確かめのスクリプトは scratchpad だけに置く（§8.3）

### 2026-10-16（元のプランへの注記）

§10 のとおり、001 §5.4・016-terms §7（制定日・連絡先・周知の表）・019 §8.3・§12・021 §6.1・§10・024 §6・§10・025 §6.3 に「026 へ移した / 026 で上書き」を足した。
当日の進行は Artifact「assift カットオーバー手順書」、日単位の準備と後始末は「assift リリース計画」で管理する。

### 2026-10-15（Gehirn DNS の今の値）

利用者が Gehirn DNS の管理画面のスクリーンショットを貼った。`assift.com` のゾーンのレコードはこれで全部（SRV・SVCB・HTTPS・CAA・AAAA は 0 件）。
DKIM の公開鍵の長い値は省いた（当夜に触らない）。

| 種類 | 名前 | TTL | 値 | 当夜 |
| --- | --- | --- | --- | --- |
| NS | `assift.com.` | 86400 | `ns2.gehirndns.com.` / `.jp.` / `.net.` / `.org.` | 触らない |
| A | `assift.com.` | （エイリアスなので欄が無い） | **エイリアス ON**: `concave-catfish-pri96kqt2zj223u7sugybxwq.herokudns.com.`（v1 の Heroku） | **Vercel の IP に替える**（エイリアス OFF、TTL 300） |
| MX | `assift.com.` | 3600 | `1 smtp.google.com.` | 触らない |
| CNAME | `9287784` | 3600 | `sendgrid.net.` | 触らない（Heroku を止めたあと消す） |
| CNAME | `em2978` | 3600 | `u9287784.wl035.sendgrid.net.` | 同上 |
| CNAME | `s1._domainkey` | 3600 | `s1.domainkey.u9287784.wl035.sendgrid.net.` | 同上 |
| CNAME | `s2._domainkey` | 3600 | `s2.domainkey.u9287784.wl035.sendgrid.net.` | 同上 |
| CNAME | `url2241` | 3600 | `sendgrid.net.` | 同上 |
| CNAME | `rsend` | 3600 | `rsend-apne1.forge.rmta.net.`（Resend） | 触らない |
| CNAME | `send` | 3600 | `send.forge.rmta.net.`（Resend） | 触らない |
| CNAME | `admin-v2` | 3600 | `f319020a4f43f5f1.vercel-dns-016.com.`（仮のホスト） | 触らない（10/31 に消す） |
| CNAME | `v2` | 3600 | `f319020a4f43f5f1.vercel-dns-016.com.`（仮のホスト） | 同上 |
| CNAME | `admin` | — | （無い） | **足す**（Vercel が示す参照先、TTL 300） |
| TXT | `1556601411.gehirn._domainkey` | 3600 | DKIM（Gehirn の SMTP） | 触らない |
| TXT | `google._domainkey` | 3600 | DKIM（Workspace） | 触らない |
| TXT | `resend._domainkey` | 3600 | DKIM（Resend） | 触らない |
| TXT | `_dmarc` | 3600 | `v=DMARC1; p=none; rua=mailto:dmarc@assift.com` | 触らない |
| TXT | `assift.com.` | 3600 | `google-site-verification=…`（値は Gehirn の画面のまま） | 触らない（Search Console） |
| TXT | `assift.com.` | 3600 | `v=spf1 a:www2298.sakura.ne.jp include:spf.mta.gis.gehirn.jp include:_spf.google.com ~all` | 触らない（Heroku を止めたあと sakura を外す） |

分かったこと:

- **`www` のレコードは無い**。v1 は apex だけで動いていた → `www` は作らない（§3-14）。v1 の Service Worker も apex にしか登録されていない
- apex の A は Gehirn のエイリアス（ALIAS）で Heroku の DNS 名を参照していて、TTL の欄が無い。前もって TTL を下げる手順は要らない（§5）。当夜はエイリアスを OFF にして Vercel の IP を入れる
- CAA は無いので、Vercel の証明書（Let's Encrypt）の発行を妨げない
- SendGrid の CNAME は 024 §9 の記録（`em2978`・`s1` / `s2._domainkey`）より 2 つ多い（`9287784`・`url2241`。ドメインの認証とリンクのブランディング）。Heroku を止めたあと 5 つとも消す（§6.6）
- 016-terms §7 の 2026-10-13 の表（MX・SPF・DKIM・DMARC）と一致

## 13. プランのレビュー

### 1 回目（2026-10-15。別の担当に実物（元のプラン・コード・v1 のコード）と突き合わせて読ませた。17 件、すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | COMMIT の後は v2 に向けた Webhook で `syncCustomer()` が Stripe に書きうるので、判断点 A の「戻せる」が崩れる | §3-12: 22:00〜判断点 B は Webhook のエンドポイントを無効にする |
| 2 | ゲートの判定が告知（10/29）の後 | §4: 告知の前にも判定する |
| 3 | Stripe の段の所要が実測されていない | §5: dry-run をリハーサルの CSV で測り、`--apply` は呼び出しの回数から見積もる |
| 4 | `--output` の既定で結果の CSV が上書きされ、repo の下に残る | §6.3: 3 回とも `--output <out>/…` |
| 5 | 021 §6.1 の `v1-subscriptions-not-migrated.csv` の解約が抜けている | §6.2・§6.3 |
| 6 | Google ログインの確認が戻せなくなった後 | §6.2 の 22:52 へ移した |
| 7 | Service Worker の確かめ方が CSP で動かない / v1 の scope は `'./'` / `www` の転送で解除できない | §8.1・§8.2・§8.3 |
| 8 | 本番の migration が main と揃っているかの確認が無い | §5: 10/29 に `migration list`、10/27 以降は merge を止める |
| 9 | 告知への申し送り（メンテナンス時間・再ログイン・パスワードの作り方・準備中の店舗） | §4-5・§9 |
| 10 | 鍵なしの 401 では `CRON_SECRET` を確かめられない | §4-2 |
| 11 | 392 件の請求見込みと v1 の売上の突き合わせが抜けている | §5（10/29 に控える）・§6.3 |
| 12 | 021 §10-5 の `max_staffs_count` の手当てが抜けている | §6.3（`admin-v2.assift.com` で） |
| 13 | v1 の準備（最新の rake・`DATABASE_URL`・ダミーの鍵）と verify の接続 | §5・§6.1・§6.2 |
| 14 | `usage_records` の CSV とリハーサルの JSONL の扱い | §6.1 |
| 15 | 当夜に移行しないのに店舗を持つ人が出たとき | §5・§3-13 |
| 16 | 管理画面のホストの扱いの誤り・参照のずれ・朝 / 昼の不一致・管理画面の Action | §8.2・§6.5・§3-3・§4 |
| 17 | Redeploy の後に Cron Jobs が無効のままか | §6.3 の 7 |

### 2 回目（2026-10-16。別の担当に、1 回目の反映を含めて実物と突き合わせて読ませた。9 件、すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | rake は `<out>` の下に日時のフォルダを作るので、`--input <out>` では manifest が見つからない | §6 の冒頭で `<dir>`（`exported to …`）を定義し、以降のパスを `<dir>` にした |
| 2 | Stripe の段が時間の窓に収まらないときの決めごとが無い（`unpaid` の下書きで呼び出しが数千回になりうる） | §5: 実測から見積もり、25 分を超えるなら §11-5 で決め直す。dry-run の所要も実測で直す |
| 3 | 昼の予行が 10/14 のデータなので、新しい異常も「移行しないのに店舗を持つ人」も昼に見つからない | §3-3・§3-13・§5: 昼にその場で新しいダンプを取って流す。§6.2 に `--overrides` |
| 4 | 019 §12 の「解約したあとの請求書の扱い」を見る項目が抜けている | §6.3 23:30 |
| 5 | Webhook の確かめ方「2xx」が実装と合わない / API の版の指定 | §4-2: 400 にならないこと・`2026-09-30.endive` で登録 |
| 6 | Scheduler のジョブを戻せるように控えていない / 中止の行に v1 を戻す手順が無い | §6.1 22:01・§6.4 |
| 7 | zsh で rake の角括弧が通らない / `rails s` がつながったままだと `dropdb` が失敗する | §6 の冒頭・§6.1 22:06・22:08 |
| 8 | §9 の注記の対象と §10 のファイルが合わない | §10 に 001・019・025 |
| 9 | sync-all のサンドボックスでの確認の前提が書かれていない | §7.3 |

### 3 回目（2026-10-16。別の担当に、2 回目の反映を中心に実物と突き合わせて読ませた。11 件、すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | 中止で片付けの SQL より先に Webhook・Cron を戻すと、v1 の Customer に `syncCustomer()` が書きうる | §6.4: `profiles` が管理用だけになってから戻す |
| 2 | 昼に用意した `--overrides` のファイルが 22:06 の削除で消えうる | `~/v1-export/overrides-20261030.json` に置き、22:06 で消さない |
| 3 | `pg:backups:download` の既定の名前（`latest.dump`）で昼と夜のダンプを取り違えうる | `-o ~/v1-export/dumps/<backup id>.dump`。22:06 で id を確かめる |
| 4 | 「392 件の請求見込み」はスクリプトが出さず、v1 の予想売上とは母集団が違う | §6.3 23:00 に計算式と違いを書いた。dry-run の突合は昼に済ませ、夜は差分だけ |
| 5 | 移行しない人の解約が判断点 B の前にある | 23:05（B の後）へ移した |
| 6 | §11-5 を決める期限が無い | §4 の 10/29 の判断で決める。案 (b) はスクリプトの変更が要る |
| 7 | §5 の事前の dry-run に `--output` が無い | 付けた |
| 8 | 23:05・23:10 がコマンドの断片 / 移行の鍵 | 全文にした。§11-3 に移行用の鍵 |
| 9 | sync-all の確かめ方が Checkout の同期と区別できない | §7.3: 行を消してから流す |
| 10 | 昼の予行の開始時刻が無い | 11:00 までに開始 |
| 11 | `--rollback` の 2 回分で本番のディスクが埋まりうる | 昼の予行の前後と 22:25 の前に Disk の使用量を見る |

### 4 回目（2026-10-16。3 回目の反映を中心に実物と突き合わせて読ませた。5 件、すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | 22:06 で昼の出力を消すので、23:00 に比べる昼の dry-run と `report.json` が無い | 昼の予行の直後に `~/v1-export/noon-20261030/` へ写し、22:06 で消さず 23:10 の後に消す |
| 2 | Disk を見るだけで基準と打つ手が無い（95% で読み取り専用・拡張は 6 時間に 1 回） | §5: 昼に 85% を超える見込みなら 16:00 までに手動で広げる。22:25 は基準を超えていたら中止 |
| 3 | 23:25 の sync-all・昼の予行の migrate:v1 がコマンドの全文でない | 全文にした（環境変数・`NODE_OPTIONS`） |
| 4 | `~/v1-export/dumps/` を作る手順が無い | §5 10/29 に `mkdir -p` |
| 5 | §11-5 (b) は期限の上で成り立たないことがある | Stripe の dry-run の計測を 10/23 までに。(b) のスクリプトの変更は merge の停止の例外 |

### 5 回目（2026-10-16。収束の判定。当夜に実行する人の目線で頭から通して読ませた。高 0・中 1・低 2、すべて反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | 10/23 の dry-run の計測は live の `stripe:setup` と移行用の鍵が前提だが、§4-2 の期限は 10/27 | §4-2 でその 2 つを 10/22 まで、§5 の 10/23 の行に前提を書いた |
| 2 | 昼の予行の rake だけコマンドが全文でない（`DATABASE_URL` が無いと古いデータを書き出しうる） | 全文にした |
| 3 | `dumped_at` に控える値の名前が rake と違う | `heroku pg:backups:info` の Started にそろえた |

### 6 回目（2026-10-16。収束の判定。日程と期限の並び・コマンドの仮置きの値の定義も見せた。**高・中 0 件で収束**。低 3 件を反映）

| # | 指摘 | 対応 |
| --- | --- | --- |
| 1 | `pg:backups:info` の Started は UTC の表示 | §6.1 22:02: `+09:00` の ISO 8601 に直して渡す |
| 2 | 昼の予行の `<昼の dir>`・`<dumped_at>` の定義と restore の全文が無い | §5 T-0 |
| 3 | §4-3 の確かめる場所が §7 と合わない | §7 はローカル、§8 は手元と `v2.assift.com` |

収束の経過: 1 回目 17 件 → 2 回目 9 件 → 3 回目 11 件 → 4 回目 5 件 → 5 回目 3 件（中 1）→ 6 回目 3 件（低のみ）。
