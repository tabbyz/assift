# 031: エラーの監視（Axiom）

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
- [ ] プライバシーポリシーの預け先に Axiom を足す（§5）
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

- **プライバシーポリシー（017）**: 預け先に Axiom（ログの保存。米国）を足す。送る情報は IP アドレス・ブラウザと端末の情報（User-Agent）・
  アクセスした URL・エラーの内容（PostgREST のエラーの本文に入力値が入ることがある）。文面は別の PR で 017 の手順に沿って直す
- ③ の作成（§3.2）
- 数日後に取り込み量（§3.1）と Vercel の Usage の Drains を見る。`static` が大半で金額が気になれば、§2-3 の作り直し

## 6. 実装ログ

### 2026-10-18

- Axiom の連携を入れ、①・② を作った（§3）。Drain の名前は `axiom-assift-production` の予定だったが、連携が作った Drain をそのまま使っている
- 届いたログに `source: static` と、プレビューと見られる `ENOTFOUND suqusuztyoymsiofwapk.supabase.co`（本番の ref は `gplvuradjykwxjbfqwnl`、
  アプリは `api.assift.com` でつなぐ。029）があった。連携の Drain は全種類・全環境を送っている → §2-3・§2-4
- `runAction` に `[action]` のログを足した（§4）
