# 029: Supabase の独自ドメイン（`api.assift.com`）と告知の PDF の置き場

- 前提: 024 §4.4.1（vanity subdomain `assift.supabase.co`）・§4.5（Google OAuth）・§4.7（Vercel の環境変数）・§5（仮のホストでの確認）/
  016-terms §7 2026-10-13（v1 の利用者への周知。規約・ポリシーの全文を PDF で渡す）/ 026 §4（前提のゲート）
- 参照（2026-10-17 に読んだ）: Supabase の Custom Domains（`https://supabase.com/docs/guides/platform/custom-domains.md`）・
  Manage Custom Domain usage（`https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains.md`）・
  CLI 2.117.0 の `npx supabase domains <sub> --help`・`npx supabase vanity-subdomains <sub> --help`

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
2. **Supabase の Custom Domain のアドオン（$0.0137 / 時間 = 月 $10 / プロジェクト）を使う**。有料プランのプロジェクトのアドオン（本番は Pro）。
   時間単位の後払いで、有効にした時間だけかかる（請求書の「Custom Domain Hours」）。**Spend Cap の対象外**。vanity subdomain は無料（ドキュメントの「Optimize usage」）。
   1 プロジェクトに 1 つだけ、サブドメインだけ（`assift.com` そのものは不可）、CNAME だけ。設定には Owner か Admin の権限が要る
3. **vanity subdomain は外す**。同じプロジェクトで独自ドメインと併用できない（ドキュメント「You can choose either a custom domain or vanity subdomain」、
   CLI「Use of custom domains and vanity subdomains is mutually exclusive」）。外すと `assift.supabase.co` は使えなくなり、ref のホストでの動作に戻る
   （`vanity-subdomains delete`「reverts to using the project ref for routing」）
   - **ref のホストで Auth が動き続けるかは、ドキュメントと CLI で食い違う**。ドキュメントは「The Supabase project domain continues to work」、
     CLI の `domains activate` と `vanity-subdomains activate` のヘルプは「auth services will no longer function on the Supabase-provisioned subdomain」。
     024 §4.4.1 は CLI の側に立っていた。本プランも **CLI の側（有効にした時点で ref のホストの Auth は止まる）で手順を組む**。§3.2-7 で実際どうなったかを記録する
4. **利用者のいないリリース前に行う**。切り替えでセッションの cookie 名が変わり、ログイン中の人が全員ログアウトする
   （`@supabase/ssr` は URL のホストの先頭から名前を作る: `sb-assift-auth-token` → `sb-api-auth-token`）。いま本番を使っているのは作業する人だけ。
   cookie 名をコードで固定する（`cookieOptions.name`）ことはしない（今回は不要で、固定すると名前の由来がコードから読めなくなる）
5. **PDF は公開バケット `legal` に置く**。バケットは本番の Dashboard で作る（migration にしない）。
   アプリの機能ではなく運用で上げる文書で、ローカルとブランチ DB には要らない。作った設定は §5 の実装ログに残す
   - 公開（Public bucket）・許す MIME は `application/pdf` だけ・1 ファイル 10MB まで
   - ファイル名は ASCII + 適用日: `terms-20261030.pdf`・`privacy-20261030.pdf`（日本語のファイル名は URL が `%E5…` になる）
   - **同じ名前で上書きしない**。周知した版の証拠になり（016-terms §7「送ったことを記録に残す」）、CDN に古い版が残る心配も無い。直すときは `-2` などを付けて別の名前で上げる
   - **消さない**。メールに残ったリンクが生き続けるように、カットオーバーの後も置いたままにする。**アドオンをやめるとリンクは切れる**ので、やめるかの判断に入れる。
     別の Supabase のプロジェクトへ移すときは、`api` の CNAME を付け替えて同じバケット・同じパスに置けばリンクは残る（ドキュメントが独自ドメインの利点として挙げる「APIs portable」）
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

CLI は `npx supabase`（`devDependencies`。2.117.0）。`domains` は `--experimental` 無しで動く（ドキュメントの例にも無い）。`vanity-subdomains` は `--experimental` が要る。
Dashboard なら Project Settings → Add-ons（Custom Domain を有効にする）→ General → Custom Domains で同じことができる。

本番が Supabase に届かない時間を短くするため、**証明書の発行（最大 30 分。DNS の反映待ちでさらに延びうる）を vanity subdomain を外す前に済ませる**。
`domains create` が vanity subdomain のあるうちは断られた場合だけ、§3.2-B の順にする。

### 3.1 事前

1. Supabase → Organization → Billing で有料プランであること、自分が Owner か Admin であることを見る
2. Gehirn DNS の `api` と `_acme-challenge.api` に既存のレコードが無いことを見る
3. Project Settings → Add-ons → Custom Domain を有効にする（ここから時間単位の課金が始まる見込み。§2-2）

### 3.2 切り替え

1. **Google のリダイレクト URI に足す**（独自ドメインを有効にした直後から、Auth は OAuth のコールバックに新しいホストを使う。ドキュメント「Prepare to activate your domain」）:
   Google Auth Platform → Clients → `assift-production` → 承認済みのリダイレクト URI に `https://api.assift.com/auth/v1/callback`。
   今ある `https://assift.supabase.co/...` と `https://<ref>.supabase.co/...` はこの段では残す（ドキュメントも「in addition to the Supabase project URL」）
2. **Gehirn DNS に CNAME**: `api` → `<ref>.supabase.co.`（TTL は短め。300 など）
3. **独自ドメインを登録**: `npx supabase domains create --project-ref <ref> --custom-hostname api.assift.com`。
   `Required outstanding validation records:` に出る TXT を 1 つ Gehirn DNS に足す（名前 `_acme-challenge.api`、値は前後の空白を落とす、TTL は短め）。
   Gehirn がゾーン名を自動で付けるので、名前に `.assift.com` まで書かない（書くと `_acme-challenge.api.assift.com.assift.com` になる。ドキュメントの注意）。
   **ここで「vanity subdomain と併用できない」旨で断られたら §3.2-B へ**
4. `npx supabase domains reverify --project-ref <ref>` を、確認済み（証明書の発行まで）になるまで間をあけて繰り返す。`npx supabase domains get --project-ref <ref>` で状態を見る
5. **vanity subdomain を外す**: `npx supabase vanity-subdomains delete --project-ref <ref> --experimental` → `npx supabase vanity-subdomains get --project-ref <ref> --experimental` で無いこと。
   ここから §3.2-7 の Redeploy まで、`NEXT_PUBLIC_SUPABASE_URL=https://assift.supabase.co` の本番は Supabase に届かない（数分）
6. **独自ドメインを有効にする**: `npx supabase domains activate --project-ref <ref>` → `domains get` で有効なこと。
   `curl -sI https://api.assift.com/auth/v1/health -H "apikey: <publishable key>"` が 200
7. **Vercel の Production の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` にして Redeploy**。
   Redeploy の後、Environment Variables の値が書き戻されていないかを見る（024 §4.4.1 と同じ。Supabase の Vercel 連携）。
   記録のため `curl -s https://<ref>.supabase.co/auth/v1/health -H "apikey: <publishable key>"` も叩き、ref のホストで Auth が応えるか（§2-3 の食い違いのどちらだったか）を実装ログに書く

#### 3.2-B `domains create` が断られたとき

vanity subdomain を先に外す。証明書を待つあいだ本番が止まらないよう、いったん ref のホストへ逃がす（vanity subdomain を外せば ref のホストの Auth は戻る。§2-3）。

1. §3.2-1・2 のあと、§3.2-5（vanity subdomain を外す）
2. すぐに Vercel の `NEXT_PUBLIC_SUPABASE_URL` を `https://<ref>.supabase.co` にして Redeploy（cookie 名がいったん `sb-<ref>-auth-token` になる。害は無い）。
   Google のリダイレクト URI の `<ref>.supabase.co` の分は 024 §9 2026-10-14 から入っている
3. §3.2-3・4（登録・TXT・確認）→ §3.2-6（有効にする）→ §3.2-7（`https://api.assift.com` にして Redeploy）

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
（独自ドメインを外したときに戻る先。Supabase の Google の画面の Callback URL も ref のまま表示される。024 §9 2026-10-14）。

## 5. 直すドキュメント

| ファイル | 変更 |
| --- | --- |
| `docs/plans/029-supabase-custom-domain/README.md` | 本プラン・実装ログ |
| `docs/plans/024-production/README.md` | §2「しない」の「Supabase の独自ドメイン（リリース後に検討）」→ 029 へ。§4.4.1 に「029 で外した」と「vanity subdomain は無料だった（029 §2-2）」を足す。§4.5-4 のリダイレクト URI・§4.7 の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` に。§6 の Google の行の「リダイレクト URI は変えない」はそのまま |
| `docs/plans/026-cutover/README.md` | §6 の 23:25 の行: `NEXT_PUBLIC_SUPABASE_URL=https://api.assift.com`・`接続先: Supabase api.assift.com`。§4-5（告知）の「PDF を添付」→「PDF のリンク（029）」。§4 にゲート（本プランの完了。10/27）を足す |
| `docs/plans/016-terms/README.md` | §7 2026-10-13 の「全文を PDF で添付」「添付の PDF」→ リンク（029）。§7 に追記の日付で残し、元の文は書き換えずに「→ 029 で上書き」を足す（026 §3-2 の書き方に合わせる） |
| `AGENTS.md` | 変えない（ホストを書いていない） |

## 6. 戻すとき

`api.assift.com` で問題が出て当日までに直せないときは、`npx supabase domains delete --project-ref <ref>` → アドオンを外す →
`npx supabase vanity-subdomains activate --project-ref <ref> --desired-subdomain assift --experimental` で 024 §4.4.1 に戻す
（`NEXT_PUBLIC_SUPABASE_URL` を `https://assift.supabase.co` に戻して Redeploy。Google のリダイレクト URI の `assift.supabase.co` の分を消していたら足し直す）。
`assift` の名前は外したあとに他のプロジェクトに取られうるので、先に `vanity-subdomains check-availability` で見る。
PDF のリンクを送る前なら失うものは無い。**告知を送った後は戻さない**（リンクが切れる）。

## 7. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）
