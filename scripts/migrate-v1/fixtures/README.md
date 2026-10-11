# 移行の fixtures（021 §12-4）

手で作った小さな JSONL。**架空の値で、個人情報を含まない**。`src/lib/migration/convert.test.ts` が読んで変換の通しを固定し、
`npm run migrate:v1 -- --input scripts/migrate-v1/fixtures --allow-existing` で seed 入りのローカル DB に入れて通せる。

パスワードは全員 `password`（`$2a$11$…`。Postgres の `crypt('password', gen_salt('bf', 11))` で作った。Devise の stretches = 11 と同じ形）。

| 何を含むか                                             | 行                                                                                                                |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 通常の人（Subscription あり・上限 20）                 | users 1 `taro`。店舗 1「小石川ストア」                                                                            |
| Google の人（uid あり・大文字のメール）                | users 2 `Hanako`。店舗 2（名前が 20 文字超・`start_of_week` が 7）。上限 1 で在籍 2（v1 の over_limit）           |
| 代理承認の人（`password_is_email`）                    | users 3 `proxy`。店舗なし                                                                                         |
| 招待未承認（移行しない）                               | users 4 `pending`                                                                                                 |
| 未確認でログイン実績なしだが店舗を持つ（保険）         | users 5 `ghost`。店舗 3（スタッフ・勤務・制約・メモ・共有が連鎖して捨てられる）。Subscription あり → not-migrated |
| 個別契約（Subscription なしで 30 人）                  | users 6 `manual`。店舗 4（名前が空・スタッフ 0 人で勤務パターンあり = 準備中でデータあり）                        |
| `stripe_customer_id` の重複                            | users 7 `dup`（users 1 と同じ Customer。Subscription あり → 持ち主は 1、7 は not-migrated）                       |
| 空のパスワード・ロック                                 | users 8 `empty`                                                                                                   |
| 親が NULL                                              | tenants 5 / patterns 50 / staffs 400 / shifts 1010 / required_nums 2008                                           |
| ペア（正常・自分自身・他店舗）                         | patterns 12→13 / 20→20 / 22→10                                                                                    |
| 色（`abc` → `#aabbcc`・NULL）                          | patterns 20 / 14                                                                                                  |
| `dayoff` の `default_required_nums`                    | patterns 13（`{}` になる）                                                                                        |
| YAML 由来の文字列（`"1"` / `"12"` / `"10"`）           | patterns 10 / staffs 100                                                                                          |
| 退職者・`max_work_week` 9・名前 10 文字超・空          | staffs 101 / 102 / 103 / 201                                                                                      |
| `available_patterns` の重複・無い・他店舗              | staffs 100（`12, "12", 99`）/ 103（`20`）                                                                         |
| `default_patterns` の 0・空・他店舗                    | staffs 100                                                                                                        |
| シフトの重複・一時 Task・店舗の不一致                  | shifts 1000/1001 / 1003 / 1004                                                                                    |
| 必要人数の焼き付け（曜日・祝日・未設定の 0）           | required_nums 2000 / 2002 / 2004。上書きは 2001 / 2003                                                            |
| 必要人数の壊れた行                                     | required_nums 2005（dayoff）/ 2006（date NULL）/ 2007（負）/ 2010（smallint 超）                                  |
| 制約の 4 種と壊れた行                                  | restrictions 3000〜3003 / 3004（days 無し）/ 3005（未知の種別）/ 3007（他店舗のパターン）                         |
| メモの重複・空・12 文字超                              | events 4000/4001 / 4002 / 4003                                                                                    |
| 共有の重複（店舗をまたぐ）・不正な code・31 日超・逆順 | shares 5000/5001 / 5002 / 5003 / 5004                                                                             |

`manifest.json` の `stats` は rake が出す集計（§5.2）の代わりの注記だけ。`usage_records.csv` は空。

作り直すときは `convert.test.ts` の期待値も見直す（件数を手で数えて書いてある）。
