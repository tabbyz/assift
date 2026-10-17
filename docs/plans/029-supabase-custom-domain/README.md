# 029: Supabase の独自ドメイン（`api.assift.com`）と告知の PDF の置き場

- 前提: 024 §4.4.1（vanity subdomain `assift.supabase.co`）・§4.5（Google OAuth）・§4.7（Vercel の環境変数）・§5（仮のホストでの確認）/
  016-terms §7 2026-10-13（v1 の利用者への周知。規約・ポリシーの全文を PDF で渡す）/ 026 §4（前提のゲート）・§5（事前の作業）・§12 2026-10-15（Gehirn DNS の今の値）
- 参照（2026-10-17 に読んだ）: Supabase の Custom Domains（`https://supabase.com/docs/guides/platform/custom-domains.md`）・
  Manage Custom Domain usage（`https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains.md`）・
  CLI 2.117.0 の `npx supabase domains <sub> --help`・`npx supabase vanity-subdomains <sub> --help`・
  Resend の Batch のドキュメント（「The `attachments` field is not supported yet.」）

## 1. 目的と完了条件

10/29 の告知（026 §4-5）で、規約とプライバシーポリシーの PDF を**添付ではなくリンク**で渡す。Resend のバッチ送信（`batch.send`）は添付を受けないため。
PDF は Supabase Storage の公開バケットに置き、リンクのホストを `*.supabase.co` ではなく自社のドメインにする。

- [ ] 公開バケット `legal` がある（§3.2。切り替えより先に作る）
- [ ] Supabase のプロジェクトが `api.assift.com` で動く（Auth・REST・Storage）。vanity subdomain（`assift.supabase.co`）は外れている
- [ ] Vercel の Production の `NEXT_PUBLIC_SUPABASE_URL` が `https://api.assift.com`
- [ ] §4 の表がすべて通り、片付けまで済んだ
- [ ] 024・026・016-terms の記述を直した（§5）
- **期限: 10/21（水）**。10/22 の本番での `--rollback` の予行（026 §4-1）の前に、§4 の片付けまで終える（試しの店舗が残ると import が
  `tenants が 0 件ではありません` で止まる。`scripts/migrate-v1/import.ts`）。間に合わなければ予行の後、10/27 までに行う。**予行の当日には行わない**
- 間に合わない・つまずいたときは §2-8（告知は `assift.supabase.co` のリンクで送り、本プランは見送る）。**カットオーバーの日は本プランのために動かさない**

## 2. 決定（2026-10-17）

1. **ホスト名は `api.assift.com`**。一つのホストで Auth・REST・Storage を受ける「バックエンドの入口」なので、`auth.` / `files.` / `db.` は中身とずれる。
   公開 API を出すことになっても `assift.com/api/...` で受ける（この名前は Supabase に使う）
2. **Supabase の Custom Domain のアドオン（$0.0137 / 時間 = 月 $10 / プロジェクト）を使う**。有料プランのプロジェクトのアドオン（本番は Pro）。
   時間単位の後払いで、有効にした時間だけかかる（請求書の「Custom Domain Hours」）。**Spend Cap の対象外**。vanity subdomain は無料（ドキュメントの「Optimize usage」）。
   1 プロジェクトに 1 つだけ、サブドメインだけ（`assift.com` そのものは不可）、CNAME だけ。設定には Owner か Admin の権限が要る。
   PDF を消さない（§2-5）ので、この費用は続く
3. **vanity subdomain は外す**。同じプロジェクトで独自ドメインと併用できない（ドキュメント「You can choose either a custom domain or vanity subdomain」、
   CLI「Use of custom domains and vanity subdomains is mutually exclusive」）。外すと `assift.supabase.co` は使えなくなり、ref のホストでの動作に戻る
   （`vanity-subdomains delete`「reverts to using the project ref for routing」）
   - **ref のホストで Auth が動き続けるかは、ドキュメントと CLI で食い違う**。ドキュメントは「The Supabase project domain continues to work」、
     CLI の `domains activate` と `vanity-subdomains activate` のヘルプは「auth services will no longer function on the Supabase-provisioned subdomain」。
     024 §4.4.1 は CLI の側に立っていた。本プランも **CLI の側（有効にした時点で ref のホストの Auth は止まる）で手順を組む**。§3.3-7 で実際どうなったかを記録する
4. **利用者のいないリリース前に行う**。切り替えでセッションの cookie 名が変わり、ログイン中の人が全員ログアウトする
   （`@supabase/ssr` は URL のホストの先頭から名前を作る: `sb-assift-auth-token` → `sb-api-auth-token`。`@supabase/supabase-js` の `sb-${hostname.split(".")[0]}-auth-token`）。
   いま本番を使っているのは作業する人だけ。cookie 名をコードで固定する（`cookieOptions.name`）ことはしない（今回は不要で、固定すると名前の由来がコードから読めなくなる）。
   JWT の検証（`getClaims`）は issuer のホストを見ないので、ホストが変わっても影響しない
5. **PDF は公開バケット `legal` に置く**。バケットは本番の Dashboard で作る（migration にしない）。
   アプリの機能ではなく運用で上げる文書で、ローカルとブランチ DB には要らない。作った設定は §7 の実装ログに残す
   - 公開（Public bucket）・許す MIME は `application/pdf` だけ・1 ファイル 10MB まで
   - ファイル名は ASCII + 適用日: `terms-20261030.pdf`・`privacy-20261030.pdf`（日本語のファイル名は URL が `%E5…` になる）
   - **同じ名前で上書きしない**。周知した版の証拠になり、CDN に古い版が残る心配も無い。直すときは `-2` などを付けて別の名前で上げる
   - **消さない**。メールに残ったリンクが生き続けるように、カットオーバーの後も置いたままにする。**アドオンをやめるとリンクは切れる**ので、やめるかの判断に入れる。
     別の Supabase のプロジェクトへ移すときは、`api` の CNAME を付け替えて同じバケット・同じパスに置けばリンクは残る（ドキュメントが独自ドメインの利点として挙げる「APIs portable」）
6. **メールでは URL をリンクの文字の裏に置く**（「利用規約（PDF）」）。HTML 版で URL がそのまま見えるのはテキスト版だけ。パスの `/storage/v1/object/public/` は独自ドメインでも残る。
   **Resend のクリック計測はオフにしておく**（オンだとリンクが Resend の計測用のホストに書き換わり、自社ドメインにした意味が無くなる）。§3.1-4 で見る
7. **周知した版の証拠を手元にも残す**（016-terms §7「送ったこと（日時・宛先の件数・添付の版）を記録に残す」の、添付の代わり）。
   添付ならメールそのものが中身の証拠になるが、リンクでは中身がサーバーにしか無い。そこで、上げた PDF の写しと SHA-256 を手元に残し、
   告知の記録に URL・SHA-256・上げた日時を書く。告知を送った後に URL から落とし直し、SHA-256 が一致することを確かめる（§3.4）
8. **間に合わない・つまずいたときの代わり: 告知は `https://assift.supabase.co/storage/v1/object/public/legal/…` のリンクで送り、本プランは見送る**。
   バケットは vanity subdomain のままでも使えるので、§3.2 を切り替えより先に済ませておけば、告知はホストに関係なく送れる。
   ただし**そのリンクで送ったら、vanity subdomain を外すとリンクが切れる**ので、切り替えはしない（するならリンクの役目が終わったと判断した後）。
   見送りの判断は 10/27（026 §4 の告知の前の判定より前）。026 のゲートは「PDF のリンクのホストが決まっている」で、本プランの完了そのものはゲートにしない
9. 選ばなかった案: 1 通ずつ送る（`emails.send` は添付を受ける）。バッチで送ることは決まっている（2026-10-17 の指示）。
   独自ドメインにすると、差出人（`noreply@assift.com`）とリンクのドメインがそろう（受け取った人が不審に思いにくい。テキスト版やリンクにカーソルを合わせたときに `assift.com` が見える）
10. 変えないもの:
    - CSP（022）: ブラウザから Supabase を呼ばない（`connect-src` は `'self'` だけ。`utils/supabase/client.ts` はどこからも使われていない）。PDF はメールから直接開くので、サイトの CSP は掛からない
    - アプリのコード: Supabase の URL は `NEXT_PUBLIC_SUPABASE_URL` からだけ読む（2026-10-17 に `src/`・`scripts/` を grep して、ホストの直書きが無いことを確かめた）
    - 認証メールのリンク（`https://v2.assift.com/auth/callback?...`。Site URL から作る）・Supabase の Site URL と Redirect URLs
    - 移行の接続先（`MIGRATION_DATABASE_URL`。DB の pooler のホストで、API のホストとは別）
    - プレビューのブランチ DB（別の ref）
    - Google のブランドの確認（024 §9 2026-10-15）: やり直しの条件はアプリ名・ロゴ・ホームページなどの変更で、リダイレクト URI は入っていない。承認済みドメイン `assift.com` の配下でもある。
      §4-5 で同意画面にアプリ名が出たままかを見る
    - DNS: Gehirn に CAA レコードは無い（026 §12 2026-10-15）ので、証明書の発行元を絞る設定は要らない

## 3. 手順（人間が行う）

CLI は `npx supabase`（`devDependencies`。2.117.0）。`domains` は `--experimental` 無しで動く。`vanity-subdomains` は `--experimental` が要る（無いと `must set the --experimental flag` で止まる）。
Dashboard なら Project Settings → Add-ons（Custom Domain を有効にする）→ General → Custom Domains で同じことができる。

本番が Supabase に届かない時間を短くするため、**証明書の発行（最大 30 分。DNS の反映待ちでさらに延びうる）を vanity subdomain を外す前に済ませる**（§3.3-4 までは本番に影響しない）。

### 3.1 事前

1. `npx supabase login`
2. Supabase → Organization → Billing で有料プランであること、自分が Owner か Admin であることを見る
3. Gehirn DNS の `api` と `_acme-challenge.api` に既存のレコードが無いことを見る
4. Resend → Domains → `assift.com` → Configuration で **Click Tracking がオフ**であることを見る（§2-6。Open Tracking はリンクを書き換えないので、どちらでもよい）
5. Project Settings → Add-ons → Custom Domain を有効にする（ここから時間単位の課金が始まる見込み。§2-2）

### 3.2 Storage（切り替えの前に作る）

1. Storage → New bucket: 名前 `legal`、Public bucket をオン、Restrict file upload size `10 MB`、Allowed MIME types `application/pdf`
2. 試しの PDF（中身は何でもよい。名前は `test-20261017.pdf`）を Dashboard から上げる
3. `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://assift.supabase.co/storage/v1/object/public/legal/test-20261017.pdf` が `200 application/pdf`。
   これで §2-8 の代わりがいつでも使える。§2-8 で見送ったときは、ここで試しの PDF を消す（見送らなければ §4-9 で消す）

### 3.3 切り替え

1. **Google のリダイレクト URI に足す**（独自ドメインを有効にした直後から、Auth は OAuth のコールバックに新しいホストを使う。ドキュメント「Prepare to activate your domain」）:
   Google Auth Platform → Clients → `assift-production` → 承認済みのリダイレクト URI に `https://api.assift.com/auth/v1/callback`。
   あわせて `https://<ref>.supabase.co/auth/v1/callback` も足す（§3.3-6・§3.3-B・§6-1 の逃がし先。2026-10-17 に見たら入っていなかった。§7）。
   今ある `https://assift.supabase.co/...` は残す（ドキュメントも「in addition to the Supabase project URL」。消すのは §4 の後）
2. **Gehirn DNS に CNAME**: `api` → `<ref>.supabase.co.`（TTL 300）
3. **独自ドメインを登録**: `npx supabase domains create --project-ref <ref> --custom-hostname api.assift.com`。
   `Required outstanding validation records:` に出る TXT を Gehirn DNS に足す（名前 `_acme-challenge.api`、値は前後の空白を落とす、TTL 300）。
   CLI は 1 件しか表示しない作りで、ドキュメントの中でも「two TXT records」と「A single TXT records」が食い違うので、`npx supabase domains get --project-ref <ref>` と
   Dashboard（General → Custom Domains）に出るものも見て、**出たものはすべて足す**。
   Gehirn がゾーン名を自動で付けるので、名前に `.assift.com` まで書かない（書くと `_acme-challenge.api.assift.com.assift.com` になる。ドキュメントの注意）。
   **ここで「vanity subdomain と併用できない」旨で断られたら §3.3-B へ**
4. `npx supabase domains reverify --project-ref <ref>` を、`Custom hostname configuration complete, and ready for activation.` が出るまで、10 分ほど間をあけて繰り返す。
   **2 時間たっても出なければ打ち切る**: `npx supabase domains delete --project-ref <ref>` で登録を消し、DNS の 2 つのレコードを見直して別の日にやり直す（期限は §1）。
   ここまでは vanity subdomain が残っているので、本番には影響しない
5. **vanity subdomain を外す**: `npx supabase vanity-subdomains delete --project-ref <ref> --experimental` → `npx supabase vanity-subdomains get --project-ref <ref> --experimental` で無いこと。
   ここから §3.3-7 の Redeploy が終わるまで、`NEXT_PUBLIC_SUPABASE_URL=https://assift.supabase.co` の本番は Supabase に届かない（Redeploy のビルドの時間ぶん）
6. **独自ドメインを有効にする**: `npx supabase domains activate --project-ref <ref>` → `Custom hostname setup completed. Project is now accessible at api.assift.com.` が出る。
   `curl -sS -o /dev/null -w '%{http_code}\n' https://api.assift.com/auth/v1/health -H "apikey: <publishable key>"` が `200`。
   **activate が失敗したら**: vanity subdomain は外れていて独自ドメインはまだ無効なので、ref のホストで動く。`NEXT_PUBLIC_SUPABASE_URL` を `https://<ref>.supabase.co` にして
   Redeploy してから調べる（§3.3-B-2 と同じ）。その日のうちに直らなければ §6 で vanity subdomain に戻す
7. **Vercel の Production の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` にして Redeploy**。
   Redeploy の後、Environment Variables の値が書き戻されていないかを見る（024 §4.4.1 と同じ。Supabase の Vercel 連携）。
   記録のため `curl -sS -o /dev/null -w '%{http_code}\n' https://<ref>.supabase.co/auth/v1/health -H "apikey: <publishable key>"` も叩き、ref のホストで health が応えたかを実装ログに書く
   （§2-3 の食い違いの手がかり。health が応えてもログインまで動く証明にはならないので、そう書き分ける）

#### 3.3-B `domains create` が断られたとき

vanity subdomain を先に外す。証明書を待つあいだ本番が止まらないよう、いったん ref のホストへ逃がす（vanity subdomain を外せば ref のホストの Auth は戻る。§2-3）。

1. §3.3-1・2 のあと、§3.3-5（vanity subdomain を外す）
2. すぐに Vercel の `NEXT_PUBLIC_SUPABASE_URL` を `https://<ref>.supabase.co` にして Redeploy（cookie 名がいったん `sb-<ref>-auth-token` になる。害は無い）。
   Google のリダイレクト URI の `<ref>.supabase.co` の分は §3.3-1 で足してある
3. §3.3-3・4（登録・TXT・確認）→ §3.3-6（有効にする）→ §3.3-7（`https://api.assift.com` にして Redeploy）。
   §3.3-4 で打ち切ったときは、ref のホストのまま §6 で vanity subdomain に戻す

### 3.4 本番の PDF（告知のタスクで行う）

文面の確定（10/28。026 §4-4）のあと、告知のタスクが行う。本プランは置き場と手順だけを決める。

1. v2 の `/terms`・`/privacy` を印刷して PDF にする（016-terms §7）。名前は `terms-20261030.pdf`・`privacy-20261030.pdf`
2. 手元に写しを残し、`shasum -a 256 terms-20261030.pdf privacy-20261030.pdf` を控える
3. Dashboard からバケット `legal` に上げ、上げた日時を控える。**上げた直後に**
   `curl -fsS https://api.assift.com/storage/v1/object/public/legal/terms-20261030.pdf | shasum -a 256` が 2 の値と一致することを確かめる（privacy も）。
   一致しなければ送らない（上書きしない決まりなので、送った後に気付くとリンクを直せない。§2-5）。`-f` は 404 のときにエラーの本文をハッシュしないため
4. Resend から自分宛てに、告知と同じ HTML（リンクの文字の裏に URL）で 1 通送り、iPhone の Gmail アプリと PC のブラウザでリンクが開く（ダウンロードではなく表示される）こと、
   リンクの URL が `https://api.assift.com/...` のまま（Resend のホストに書き換わっていない）ことを見る
5. 告知を送ったあと、3 と同じ照合をもう一度して、告知の記録（016-terms §7）に URL・SHA-256・上げた日時・照合した日時を書く

## 4. 確かめること（`v2.assift.com` / `admin-v2.assift.com`）

§3.3 の直後に、同じ日のうちに片付けまで行う。試しのアカウントは **v1 に無いメール**を使う（重なると移行が ROLLBACK する。024 §5・021 §9.3）。

| # | 確かめること | 期待 |
| --- | --- | --- |
| 1 | DevTools → Application → Cookies | ログインすると `sb-api-auth-token`（分割されれば `.0`・`.1`）ができる。古い `sb-assift-auth-token*` は使われない（残っていれば消してよい） |
| 2 | 024 §5-2（登録と確認メール） | リンクは `https://v2.assift.com/auth/callback?...` のまま。開くとログイン状態 |
| 3 | 024 §5-3・4（ログイン・パスワード再設定） | 通る |
| 4 | 024 §5-5（Google ログイン） | 同意画面に `assift`。Google の画面の URL の `redirect_uri` が `https://api.assift.com/auth/v1/callback`。戻ってログイン状態 |
| 5 | 同意画面の表示 | ブランドの確認が外れていない（「`api.assift.com` に移動」ではなくアプリ名が出る） |
| 6 | 024 §5-10（管理画面） | `admin-v2.assift.com/-/login` で入れる |
| 7 | 024 §5-6 の一部（店舗の作成とアサイン） | 保存される（REST が新しいホストで動く） |
| 8 | 024 §5-11（CSP） | 違反が 0 件（変わらない見込みだが、ログインの経路が変わるので見る） |
| 9 | Storage | `curl -sS -o /dev/null -w '%{http_code} %{content_type}\n' https://api.assift.com/storage/v1/object/public/legal/test-20261017.pdf` が `200 application/pdf`。見たら試しの PDF を消す |
| 10 | 片付け | 024 §5-14 と同じ（試しの店舗を消す → 試しのアカウントを消す。`select count(*) from public.tenants` が 0、`auth.users` は管理用だけ） |

DNS の後始末: `api` の CNAME と `_acme-challenge.api` の TXT の TTL を 3600 に戻す（026 の慣例の 300 → 3600）。TXT は**消さない**（証明書の更新に使われうる）。

Google のリダイレクト URI の `https://assift.supabase.co/auth/v1/callback` は、**告知を送った後に**消す（それまでは §6 で戻しうる）。`<ref>.supabase.co` の分は残す
（§3.3-6 の逃がし先。Supabase の Google の画面の Callback URL も ref のまま表示される。024 §9 2026-10-14）。

## 5. 直すドキュメント

本プランの作業が終わったら（§2-8 で見送ったときは、その旨で）直す。**026 §5 の「10/27 以降は main への merge を止める」より前に merge する**
（merge すると Production がビルドされる）。間に合わなければ、文書だけの変更として 026 §5 の例外に「029 の文書の修正」を足してから merge する。

| ファイル | 変更 |
| --- | --- |
| `docs/plans/029-supabase-custom-domain/README.md` | 本プラン・実装ログ |
| `docs/plans/024-production/README.md` | §2「しない」の「Supabase の独自ドメイン（リリース後に検討）」→ 029 へ。§4.4.1 に「029 で外した」と「vanity subdomain は無料だった（029 §2-2）」を足す。§4.5-4 のリダイレクト URI（「当日も変えない」はそのまま `api.assift.com` について）・§4.7 の `NEXT_PUBLIC_SUPABASE_URL` を `https://api.assift.com` に。§6 の Google の行の「リダイレクト URI は変えない」はそのまま |
| `docs/plans/026-cutover/README.md` | §3-2 の理由の「告知・添付の PDF・ページの日付がそろう」→「PDF」。§4 に「PDF のリンクのホストが決まっている（`api.assift.com`、§2-8 の `assift.supabase.co`、または §6-1 の `<ref>.supabase.co`）。10/27」を足し、**告知の前の判定**に入れる（026 §4 の冒頭の「1〜4」を書き換える。本プランの完了はゲートにしない）。§6.6（公開後の作業）に「029 で `api.assift.com` に切り替えたときだけ、Google のリダイレクト URI から `https://assift.supabase.co/auth/v1/callback` を消す（029 §4）。§2-8 で見送ったときは消さない（Google ログインがそれを使っている）」を足す。以下の `NEXT_PUBLIC_SUPABASE_URL` と `接続先` の値は**切り替えたとき**のもので、見送ったときは `https://assift.supabase.co` のまま、§6-1 で ref のホストに逃がしたときは `https://<ref>.supabase.co`。§4-5 の「PDF を添付」と確かめ方の「添付の版の記録」→ リンク・SHA-256（029 §3.4）。§5 の 10/29 に「Production の `NEXT_PUBLIC_SUPABASE_URL` が `https://api.assift.com` のまま」を足す。§6 の 23:25 の行: `NEXT_PUBLIC_SUPABASE_URL=https://api.assift.com`・`接続先: Supabase api.assift.com`。§6.3 の Redeploy の後にも `NEXT_PUBLIC_SUPABASE_URL` を見る。§12 2026-10-15 の DNS の表に `api`（CNAME）と `_acme-challenge.api`（TXT）を「触らない」で足す（§5 の 10/29 の「変わっていないか見る」で差分に見えないように） |
| `docs/plans/016-terms/README.md` | §7 2026-10-13 の「全文を PDF で添付」（264 行）・「添付の PDF に全文」（272 行）・「添付の PDF は」（296 行）・「添付の版」（297 行）・「告知に添付する PDF」（307 行）。元の文は書き換えずに、日付つきの追記で「→ 029 で上書き: リンク。証拠は写しと SHA-256」とする（026 §3-2 の書き方に合わせる） |
| `AGENTS.md` | 変えない（ホストを書いていない） |

## 6. 戻すとき

**告知を `api.assift.com` のリンクで送った後は戻さない**（リンクが切れる）。送る前なら失うものは無い。

`api.assift.com` で問題が出て、その日のうちに直せないとき:

1. `npx supabase vanity-subdomains check-availability --project-ref <ref> --desired-subdomain assift --experimental` で `assift` が空いていること（外したあとに他のプロジェクトに取られうる）。
   **空いていなければ** vanity subdomain には戻さず、ref のホストで運用する（§3.3-6 の失敗の分岐と同じ状態）。そのときは §6-2・4 を飛ばし、§6-3・6 は行い、
   §6-5 の URL は `https://<ref>.supabase.co`、§6-7 の告知のリンクは `https://<ref>.supabase.co/storage/v1/object/public/legal/…` に読み替える
2. Google のリダイレクト URI に `https://assift.supabase.co/auth/v1/callback` があること（消していたら**先に**足し直す。vanity subdomain を有効にした直後から Auth がそれを使う）
3. `npx supabase domains delete --project-ref <ref>`（§3.3-4 の打ち切りで消していれば飛ばす）
4. `npx supabase vanity-subdomains activate --project-ref <ref> --desired-subdomain assift --experimental` → `get` で `Status: active`
5. Vercel の `NEXT_PUBLIC_SUPABASE_URL` を `https://assift.supabase.co` に戻して Redeploy
6. Project Settings → Add-ons → Custom Domain を外す（外した時点から課金が止まる）。Gehirn DNS の `api` の CNAME と `_acme-challenge.api` の TXT を消す
7. 告知は §2-8 のとおり `assift.supabase.co` のリンクで送る

## 7. 実装ログ

（作業のあとに、日時・確かめた結果・つまずいた点を書く。秘密の値は書かない）

### 2026-10-17（§3.1・§3.2）

- §3.1: Pro プラン・Owner / Admin・Gehirn に `api` と `_acme-challenge.api` が無い・Resend の Click Tracking がオフ、を確かめた。Custom Domain のアドオンを有効にした
- §3.2: バケット `legal` を作った（Public・10 MB・`application/pdf`）。`https://assift.supabase.co/storage/v1/object/public/legal/test-20261017.pdf` が `200 application/pdf`（§2-8 の代わりが使える）
- Storage は無いオブジェクトに 404 ではなく **400 + JSON**（`application/json`）を返す（ファイルを上げる前に叩いて 400 だった）。§3.4-3 の `curl -f` は 400 でも失敗になるので、照合の手順はそのままでよい

### 2026-10-17（§3.3-1 の前に Google のリダイレクト URI を見た）

- 登録されていたのは `https://assift.supabase.co/auth/v1/callback` の 1 つだけで、`https://<ref>.supabase.co/auth/v1/callback` は無かった
  （024 §9 2026-10-14 の「2 つ入れた」と違う。その後に消したか、保存されていなかった）。逃がし先に要るので、§3.3-1 で `api.assift.com` と一緒に足す

### 2026-10-17（§3.3-1〜3）

- §3.3-1: Google のリダイレクト URI を `assift.supabase.co`・`api.assift.com`・`<ref>.supabase.co` の 3 つにした
- §3.3-3: `domains create` は vanity subdomain のあるうちは断られた:
  `unexpected create hostname status 544: {"message":"Delete the vanity subdomain associated with your project before attempting to create a new custom hostname"}`。
  §3.3-B の順に切り替える（証明書を待つあいだは ref のホストで動かす）

### 2026-10-17（§3.3-B）

- B-1: `vanity-subdomains delete` → `get` で無いことを確かめた。B-2: `NEXT_PUBLIC_SUPABASE_URL` を `https://<ref>.supabase.co` にして Redeploy、書き戻しなし、ref のホストの health が 200、`v2.assift.com` でログインできた
- B-3: `domains create` → `Custom hostname setup is being initialized; please request re-verification in a few seconds.`。
  `_acme-challenge.api` の TXT を Gehirn に足したあとの `domains reverify` は `status 400: {"message":"Verification has been completed, please proceed to activation."}`。
  CLI は 400 をエラーとして表示するが、中身は完了の知らせ
- §3.3-6: `domains activate` → `Custom hostname setup completed. Project is now accessible at api.assift.com.`
