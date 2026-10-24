# 033: エラーの監視（Axiom）

- 前提: 023 §2「作らない」（エラー収集は別のプランで）/ 019（課金の cron・`[billing]` のログ）/ 012（`[assist]` のログ）/ 017（データの預け先）
- 参照（2026-10-18 に読んだ）: Axiom の料金（`https://axiom.co/pricing`）・Vercel の連携（`https://axiom.co/docs/integrations/vercel`）/
  Vercel の Drains の料金（changelog「Reduced Log Drains costs」）・Log Drains Reference（`source` の値）/ Sentry・PostHog の料金（比較だけ）

## 1. 目的と完了条件

サーバーの例外は Vercel の Runtime Logs に残るが、Pro の標準では 1 日で消え、通知も無い。023 の「エラー番号で問い合わせと突き合わせる」は
翌々日の問い合わせで成り立たない。課金の cron（毎日 23:20 / 23:50 JST）の失敗は取り返せないのに、気付く手段が無い。

- [x] Vercel のログが Axiom に届く（Vercel Marketplace の連携。§3.1）
- [x] 監視 ① 課金の失敗・② サーバーエラーを作り、通知の送り先（メール）につなぐ（§3.2）
- [ ] 監視 ③ 課金の cron が走っていない、を作る（初回の cron のログを確かめてから。§3.2）
- [x] Server Action の想定外の例外がログに残る（§4）
- [x] プライバシーポリシーの委託先に Axiom を足す（§5）
- [ ] 数日後に Axiom の取り込み量と Vercel の Drains の金額を見る（§3.1）

## 2. 決定（2026-10-18）

1. **Axiom を使う。** Vercel の連携で入り、コードを変えずに始められる。CSP（022）を触らない（ブラウザは何も送らない）。
   無料の Personal プラン（月 500GB の取り込み。保存は 30 日とされるが公式ページでは未確認）。既存の `console.error('[billing] …')` の目印がそのまま監視の条件になる
2. **Sentry はいま入れない。** 例外の集約・ソースマップ・ブラウザの例外は Sentry が上だが、困るのはサーバー側（課金・cron・自動アサイン）で、
   ブラウザ側は問い合わせのエラー番号で追える。ブラウザだけで起きる失敗の問い合わせが来るようになったら、Sentry の無料プランを足す
   （そのときは `tunnelRoute` で同一オリジンにし、CSP を変えない）
3. **Static Files やプレビューのログも届くが、受けたままクエリで絞る。** 連携が作る Drain は送る種類と環境を編集できなかった。
   Drains は Pro で 1GB あたり $0.50。静的ファイルのログを多めに見積もっても月 0.3GB 前後（$0.15）。量が増えたら、連携の Drain を外して
   Custom の Drain（Axiom の受け口 + `Authorization: Bearer <取り込み専用のトークン>`）に作り直す
4. **監視のクエリは必ず `['vercel.environment'] == "production"` と `['vercel.source']` で絞る。**
   閉じた PR のプレビュー（ブランチ DB が消えている）を開かれると `ENOTFOUND <ref>.supabase.co` が出る。これで通知を鳴らさない
5. 通知はメールの Notifier。監視の名前は件名に出るので `assift prod: <何が起きたか>（<条件>）` にそろえる

## 3. 設定（Axiom・Vercel。コードの外）

### 3.1 連携

- Vercel の Marketplace から Axiom を入れた（2026-10-18）。データセットは `vercel`
- 届くログの項目（実物で確かめた）: `level`・`message`・`request.{host,path,statusCode,…}`・`vercel.{environment,source,route,…}`
- `vercel.source` の値と Drain の画面の対応: `lambda` = Functions / `edge` = Edge Functions / `static` = Static Files / `external` = Rewrites /
  `redirect` = Redirects / `build` = Builds / `firewall` = Firewall
- 取り込み量の確かめ方:
  ```kusto
  ['vercel']
  | where _time > ago(1d)
  | summarize count() by ['vercel.source']
  ```

### 3.2 監視

| | 種類 | 条件 | 実行 / 期間 | データ無しで通知 |
| - | - | - | - | - |
| ① `assift prod: 課金の処理に失敗した` | Match | 下のクエリに 1 行でも合う | — | — |
| ② `assift prod: サーバーエラーが続いている` | Threshold | above or equal to（最初は 1。多ければ上げる） | 5 分 / 10 分 | オフ（正常なときほど鳴る） |
| ③ `assift prod: 課金の cron が走っていない（25時間で2回未満）` | Threshold | below 2 | 1 時間 / 25 時間 | **オン**（止まると 0 行） |

① **`level == "error"` を外さない。** cron は成功したときも `console.info('[billing] 定期実行', …)` を出す（`api/cron/billing-usage/route.ts`）。

```kusto
['vercel']
| where ['vercel.environment'] == "production"
| where ['vercel.source'] == "lambda"
| where level == "error"
| where message contains "[billing]"
```

②（`[action]` の想定外のエラー（§4）もここで拾う）

```kusto
['vercel']
| where ['vercel.environment'] == "production"
| where ['vercel.source'] in ("lambda", "edge")
| where level == "error" or toint(['request.statusCode']) >= 500
| summarize count()
```

③ 成功したときに必ず出る `[billing] 定期実行` を数える（URL へのアクセスを数えると 401 も入る）。期間を 25 時間にするのは、
ログが届く遅れで 23:20 の分を取りこぼさないため。1 日 2 回のうち片方だけ欠けても請求には効かないので、両方欠けたときを確実に拾う側に倒す。
**連携を入れた日には cron のログがまだ無いので、初回（23:20 / 23:50）のあとで `summarize` を外して 2 行出るのを確かめてから作る。**

```kusto
['vercel']
| where ['vercel.environment'] == "production"
| where ['vercel.source'] == "lambda"
| where level == "info"
| where message contains "[billing] 定期実行"
| summarize count()
```

自動アサイン（`[assist]`）も通知するなら、① の `[billing]` を置き換えたものを足す。

### 3.3 問い合わせのエラー番号から引く

```kusto
['vercel']
| where message contains "<エラー番号（digest）>"
```

## 4. コード: Server Action の想定外の例外を残す

`runAction`（`lib/actions/run.ts`）は例外を `ActionFailure` に変えるだけで、ログに何も出していなかった。シフトのアサイン・設定の保存など
書き込みの多くが Server Action なので、ここで落ちても Axiom に届かず ② も鳴らない。

- `ActionError`（業務上の失敗。上限など）でも `ZodError`（入力の誤り）でもない例外だけ、`console.error('[action] 想定外のエラー', error)` を出す
- redirect / notFound は `unstable_rethrow` で先に投げ直すので、ログに出ない
- 画面の文言は変えない（「処理に失敗しました」のまま）
- Vitest: `lib/actions/run.test.ts`

## 5. 残り

- ~~プライバシーポリシー（017）の委託先に Axiom を足す~~ → 足した（§6 2026-10-18。017 §7 2026-10-18）
- ~~③ の作成（§3.2）~~ → 2026-10-24 に有効にした（§6）。残りは通知のメールが届くのを 1 回確かめること
- 数日後に取り込み量（§3.1）と Vercel の Usage の Drains を見る。`static` が大半で金額が気になれば、§2-3 の作り直し

## 6. 実装ログ

### 2026-10-18

- Axiom の連携を入れ、①・② を作った（§3）。Drain の名前は `axiom-assift-production` の予定だったが、連携が作った Drain をそのまま使っている
- 届いたログに `source: static` と、プレビューと見られる `ENOTFOUND suqusuztyoymsiofwapk.supabase.co`（本番の ref は `gplvuradjykwxjbfqwnl`、
  アプリは `api.assift.com` でつなぐ。029）があった。連携の Drain は全種類・全環境を送っている → §2-3・§2-4
- `runAction` に `[action]` のログを足した（§4）
- プライバシーポリシーの「委託先と外国への移転」に `Axiom（米国）：エラーの記録と監視` を足し、前置きを「主に次の事業者に」にした。
  名前の一覧を全部と読まれないようにする（ログ・監視の道具を足すたびに食い違わない）。送る情報（IP アドレス・User-Agent など）までは書かない
  （ほかの委託先も業務だけを書いている。外国への委託で名前の公表までは求められない）。告知の PDF（`privacy-20261030.pdf`）はまだ作っていないので、この文から作る

### 2026-10-19（main の取り込み・番号の付け替え）

- main に 031（お問い合わせフォーム）・032（Missive）が入っていたので、本プランを 031 から 033 に付け替えた（ディレクトリ・`run.ts` のコメント・AGENTS.md・023・017 の参照）。
  ブランチ名とそれまでのコミットの件名は 031 のまま
- ポリシーの委託先の衝突: main の Vercel の行（「不正な送信の判定」を足したもの）を採り、その下に Axiom の行を残した
- お問い合わせフォームの Action（`contact/actions.ts` の `toSendFailure`）は想定外の例外を自分で `[contact]` のログに出してから `ActionError` に変えるので、
  `runAction` の `[action]` と二重には出ない

### 2026-10-24（③ の前提の確かめ）

- 10/23 に `CRON_SECRET` と Stripe の鍵が Production に入り（035 §5.6）、その夜の cron の `[billing] 定期実行`（info）が 23:21:18・23:51:11 に 1 行ずつ届いた（手動の 09:46 の分を合わせて 3 行。`failed` はどれも 0）。
  §3.2 の ③ のクエリ（`summarize count()` を外したもの）で見た。cron は予定の 1 分ほど後に走る
- ③ は前もって作って無効にしてあった。設定が §3.2 のとおり（上のクエリに `summarize count()`・Threshold below 2・1 時間ごと・期間 25 時間・データ無しで通知オン）なのを確かめ、有効にした。
  10/30 の昼に Cron Jobs と一緒に止め、11/1 の朝に戻す（026 §5・§6.6・手順書の p14・a03）
