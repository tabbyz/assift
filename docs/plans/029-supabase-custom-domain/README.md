# 029: Supabase の独自ドメイン（`api.assift.com`）と告知の PDF の置き場

- 前提: 024 §4.4.1（vanity subdomain `assift.supabase.co`）・§4.5（Google OAuth）・§4.7（Vercel の環境変数）・§5（仮のホストでの確認）/
  016-terms §7 2026-10-13（v1 の利用者への周知。規約・ポリシーの全文を PDF で渡す）/ 026 §4（前提のゲート）
- 参照: Supabase の Custom Domains（`https://supabase.com/docs/guides/platform/custom-domains`）・料金（`https://supabase.com/pricing`）。
  2026-10-17 はこの環境から supabase.com に届かず、検索結果の要約で確かめた（下記 §2-2・§2-3）。手順のコマンドは作業のときに `--help` と Dashboard で確かめる

## 1. 目的と完了条件

10/29 の告知（026 §4-5）で、規約とプライバシーポリシーの PDF を**添付ではなくリンク**で渡す。Resend のバッチ送信（`batch.send`）は添付を受けないため。
PDF は Supabase Storage の公開バケットに置き、リンクのホストを `*.supabase.co` ではなく自社のドメインにする。

- [ ] Supabase のプロジェクトが `api.assift.com` で動く（Auth・REST・Storage）。vanity subdomain（`assift.supabase.co`）は外れている
- [ ] Vercel の Production の `NEXT_PUBLIC_SUPABASE_URL` が `https://api.assift.com`
- [ ] Google ログインの `redirect_uri` が `https://api.assift.com/auth/v1/callback`
- [ ] 024 §5 の 2〜5・10 を `v2.assift.com` / `admin-v2.assift.com` でやり直して通る
- [ ] 公開バケット `legal` があり、試しの PDF が `https://api.assift.com/storage/v1/object/public/legal/…` で開ける（iPhone の Gmail アプリ・PC のブラウザ）
- [ ] 024・026・016-terms の `assift.supabase.co` と「PDF を添付」の記述を直した
- **期限: 10/24（土）**。遅くとも 026 §4 のゲート（10/27）まで。告知の PDF（文面の確定は 10/28。026 §4-4）を上げる前に、ホストが決まっている必要がある

## 2. 決定（2026-10-17）

1. **ホスト名は `api.assift.com`**。一つのホストで Auth・REST・Storage を受ける「バックエンドの入口」なので、`auth.` / `files.` / `db.` は中身とずれる。
   公開 API を出すことになっても `assift.com/api/...` で受ける（この名前は Supabase に使う）
2. **Supabase の Custom Domain のアドオン（月 $10 / プロジェクト）を使う**。有料プランが前提（本番は Pro）
3. **vanity subdomain は外す**。同じプロジェクトで独自ドメインと併用できない（Supabase のドキュメント）。外すと `assift.supabase.co` は使えなくなる
4. **利用者のいないリリース前に行う**。切り替えでセッションの cookie 名が変わり、ログイン中の人が全員ログアウトする
   （`@supabase/ssr` は URL のホストの先頭から名前を作る: `sb-assift-auth-token` → `sb-api-auth-token`）。いま本番を使っているのは作業する人だけ。
   cookie 名をコードで固定する（`cookieOptions.name`）ことはしない（今回は不要で、固定すると名前の由来がコードから読めなくなる）
5. **PDF は公開バケット `legal` に置く**。バケットは本番の Dashboard で作る（migration にしない）。
   アプリの機能ではなく運用で上げる文書で、ローカルとブランチ DB には要らない。作った設定は §5 の実装ログに残す
   - 公開（Public bucket）・許す MIME は `application/pdf` だけ・1 ファイル 10MB まで
   - ファイル名は ASCII + 適用日: `terms-20261030.pdf`・`privacy-20261030.pdf`（日本語のファイル名は URL が `%E5…` になる）
   - **同じ名前で上書きしない**。周知した版の証拠になり（016-terms §7「送ったことを記録に残す」）、CDN に古い版が残る心配も無い。直すときは `-2` などを付けて別の名前で上げる
   - **消さない**。メールに残ったリンクが生き続けるように、カットオーバーの後も置いたままにする。アドオンをやめる・プロジェクトを移すときは、このリンクが切れることを判断に入れる
6. **メールでは URL をリンクの文字の裏に置く**（「利用規約（PDF）」）。HTML 版で URL がそのまま見えるのはテキスト版だけ。パスの `/storage/v1/object/public/` は独自ドメインでも残る
7. 変えないもの:
   - CSP（022）: ブラウザから Supabase を呼ばない（`utils/supabase/client.ts` はどこからも使われていない）。PDF はメールから直接開くので、サイトの CSP は掛からない
   - アプリのコード: Supabase の URL は `NEXT_PUBLIC_SUPABASE_URL` からだけ読む（2026-10-17 に `src/`・`scripts/` を grep して、ホストの直書きが無いことを確かめた）
   - 認証メールのリンク（`https://v2.assift.com/auth/callback?...`。Site URL から作る）・Supabase の Site URL と Redirect URLs
   - 移行の接続先（`MIGRATION_DATABASE_URL`。DB の pooler のホストで、API のホストとは別）
   - プレビューのブランチ DB（別の ref）
   - Google のブランドの確認（024 §9 2026-10-15）: やり直しの条件はアプリ名・ロゴ・ホームページなどの変更で、リダイレクト URI は入っていない。承認済みドメイン `assift.com` の配下でもある。
     §4-5 で同意画面にアプリ名が出たままかを見る

## 3. 手順（人間が行う）

`v2.assift.com` は §3-2 から §3-7 のあいだ Google ログインやログインそのものが通らない時間がある（利用者はいない）。一度に通して行う。

### 3.1 事前

1. Supabase → Organization → Billing で、Custom Domain のアドオンの料金と、有料プランであることを確かめる
2. Gehirn DNS の `api` に既存のレコードが無いことを見る
3. CLI のコマンドを確かめる: `npx supabase domains --help`・`npx supabase vanity-subdomains --help`（`--experimental` が要るか）。
   Dashboard なら Project Settings → General → Custom Domains

### 3.2 切り替え

1. **Google のリダイレクト URI に足す**（先に入れておく。有効にした直後から Auth は新しいホストを `redirect_uri` に使う）:
   Google Auth Platform → Clients → `assift-production` → 承認済みのリダイレクト URI に `https://api.assift.com/auth/v1/callback`。
   今ある `https://assift.supabase.co/...` と `https://<ref>.supabase.co/...` はこの段では残す
2. **Gehirn DNS に CNAME**: `api` → `<ref>.supabase.co.`（TTL は短め。300 など）
3. **vanity subdomain を外す**: `npx supabase vanity-subdomains delete --project-ref <ref> --experimental` → `get` で無いことを確かめる。
   ここから §3.2-6 まで、`NEXT_PUBLIC_SUPABASE_URL=https://assift.supabase.co` の本番は Supabase に届かない
4. **独自ドメインを登録**: `npx supabase domains create --project-ref <ref> --custom-hostname api.assift.com`。
   表示された TXT（`_acme-challenge.api` など。証明書と所有の確認）を Gehirn DNS に足す
5. `npx supabase domains reverify --project-ref <ref>` を、確認済みになるまで繰り返す（DNS の反映と証明書の発行を待つ）
6. `npx supabase domains activate --project-ref <ref>` → `npx supabase domains get --project-ref <ref>` で有効なことを見る。
   `curl -sI https://api.assift.com/auth/v1/health`（公開鍵が要るなら `-H "apikey: <publishable key>"`）が 200
7. **Vercel の Production の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` にして Redeploy**。
   Redeploy の後、Environment Variables の値が書き戻されていないかを見る（024 §4.4.1 と同じ。Supabase の Vercel 連携）

### 3.3 Storage

1. Storage → New bucket: 名前 `legal`、Public bucket をオン、Restrict file upload size `10 MB`、Allowed MIME types `application/pdf`
2. 試しの PDF（中身は何でもよい。名前は `test-20261017.pdf`）を Dashboard から上げる
3. `curl -sI https://api.assift.com/storage/v1/object/public/legal/test-20261017.pdf` が 200 で、`content-type: application/pdf`
4. その URL を自分宛てのメールに貼り、iPhone の Gmail アプリと PC のブラウザで開ける（ダウンロードではなく表示される）ことを見る
5. 試しの PDF を消す

本番の PDF（`terms-20261030.pdf`・`privacy-20261030.pdf`）は、告知のタスクが文面の確定（10/28。026 §4-4）のあとに作って上げる（016-terms §7: v2 の `/terms`・`/privacy` を印刷する）

## 4. 確かめること（`v2.assift.com` / `admin-v2.assift.com`）

| # | 確かめること | 期待 |
| --- | --- | --- |
| 1 | DevTools → Application → Cookies | ログインすると `sb-api-auth-token`（分割されれば `.0`・`.1`）ができる。古い `sb-assift-auth-token*` は使われない（残っていれば消してよい） |
| 2 | 024 §5-2（登録と確認メール） | リンクは `https://v2.assift.com/auth/callback?...` のまま。開くとログイン状態 |
| 3 | 024 §5-3・4（ログイン・パスワード再設定） | 通る |
| 4 | 024 §5-5（Google ログイン） | 同意画面に `assift`。アドレスバーの `redirect_uri` が `https://api.assift.com/auth/v1/callback`。戻ってログイン状態 |
| 5 | 同意画面の表示 | ブランドの確認が外れていない（「`api.assift.com` に移動」ではなくアプリ名が出る） |
| 6 | 024 §5-10（管理画面） | `admin-v2.assift.com/-/login` で入れる |
| 7 | 024 §5-6 の一部（店舗の作成とアサイン） | 保存される（REST が新しいホストで動く） |
| 8 | 024 §5-11（CSP） | 違反が 0 件（変わらない見込みだが、ログインの経路が変わるので見る） |
| 9 | §3.3-3・4 | PDF が開ける |
| 10 | 片付け | 024 §5-14 と同じ（試しのアカウント・店舗を消す。管理用だけが残る） |

通ったら、Google のリダイレクト URI から `https://assift.supabase.co/auth/v1/callback` を消す（もう使われない）。`<ref>.supabase.co` の分は残す
（独自ドメインを有効にしても ref のホストは動き続ける。Supabase の Google の画面の Callback URL も ref のまま表示される。024 §9 2026-10-14）。

## 5. 直すドキュメント

| ファイル | 変更 |
| --- | --- |
| `docs/plans/029-supabase-custom-domain/README.md` | 本プラン・実装ログ |
| `docs/plans/024-production/README.md` | §2「しない」の「Supabase の独自ドメイン（リリース後に検討）」→ 029 へ。§4.4.1 に「029 で外した」を足す。§4.5-4 のリダイレクト URI・§4.7 の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` に。§6 の Google の行の「リダイレクト URI は変えない」はそのまま |
| `docs/plans/026-cutover/README.md` | §6 の 23:25 の行: `NEXT_PUBLIC_SUPABASE_URL=https://api.assift.com`・`接続先: Supabase api.assift.com`。§4-5（告知）の「PDF を添付」→「PDF のリンク（029）」。§4 にゲート（本プランの完了。10/27）を足す |
| `docs/plans/016-terms/README.md` | §7 2026-10-13 の「全文を PDF で添付」「添付の PDF」→ リンク（029）。§7 に追記の日付で残し、元の文は書き換えずに「→ 029 で上書き」を足す（026 §3-2 の書き方に合わせる） |
| `AGENTS.md` | 変えない（ホストを書いていない） |

## 6. 戻すとき

`api.assift.com` で問題が出て当日までに直せないときは、アドオンを外して `npx supabase vanity-subdomains activate --desired-subdomain assift` で 024 §4.4.1 に戻す
（Google のリダイレクト URI・`NEXT_PUBLIC_SUPABASE_URL` も戻す）。PDF のリンクを送る前なら失うものは無い。**告知を送った後は戻さない**（リンクが切れる）。

## 7. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）
