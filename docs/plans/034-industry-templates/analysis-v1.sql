-- 034 §3: 業種テンプレートを見直すための、v1 の実データの集計。
--
-- 流す先: v1 の DB（Rails のスキーマ。v2 の Supabase ではない）。
--   - 021 のリハーサルのダンプを手元に戻したもの（推奨。本番に負荷をかけない）
--   - または Heroku の primary（`heroku pg:psql`）。follower は読み取り専用で temp table を作れないので不可
-- 書き込むのは temp table / temp view だけ（セッションを閉じると消える）。v1 の表は読むだけ。
--
-- 流し方（出力の CSV は psql を起動したディレクトリに書く）:
--   mkdir -p ~/assift-034 && cd ~/assift-034
--   psql "$V1_DATABASE_URL" -f <repo>/docs/plans/034-industry-templates/analysis-v1.sql
--
-- 共有してよいのは q*.csv だけ（集計。勤務の名前は 5 店舗以上・説明は 3 店舗以上で使われたものだけ）。
-- private_*.csv は店舗名そのものなので、手元で見るだけにする（Claude やリポジトリに渡さない。§3.3）。
--
-- 業種は店舗名のキーワードからの推定（§3.2）。外れや取りこぼしは private_sample_names.csv で目で確かめる。

\set ON_ERROR_STOP on
\timing on

-- 0. 下ごしらえ ----------------------------------------------------------------

-- 対象の店舗。運営（@assift.com）の店舗は除く
create temp table a_tenant as
select t.id as tenant_id,
       t.user_id,
       t.shift_cycle,
       t.created_at,
       normalize(coalesce(t.name, ''), nfkc) as name_n
  from tenants t
  join users u on u.id = t.user_id
 where u.email not ilike '%@assift.com';

-- 直近 1 年（と先の 2 か月）のアサイン数。自動アサインの一時 Task（staff_id が null）は数えない
create temp table a_pattern_use as
select s.pattern_id, count(*) as shifts
  from shifts s
 where s.staff_id is not null
   and s.date >= current_date - 365
   and s.date < current_date + 60
 group by s.pattern_id;

-- 使われている店舗: 直近 1 年に 30 コマ以上のアサインがあり、在籍スタッフが 1 人以上
create temp table a_active as
select a.*, st.staffs, pu.shifts
  from a_tenant a
  join (select p.tenant_id, sum(u.shifts) as shifts
          from patterns p
          join a_pattern_use u on u.pattern_id = p.id
         group by p.tenant_id) pu on pu.tenant_id = a.tenant_id
  join (select tenant_id, count(*) as staffs
          from staffs
         where not coalesce(disabled, false)
         group by tenant_id) st on st.tenant_id = a.tenant_id
 where pu.shifts >= 30;

-- 店舗名から業種を推定する。上から順に当てる（「ネットカフェ」を飲食に、「ホームセンター」を介護に入れないため）
create temp table a_industry as
select tenant_id,
       case
         when name_n ~* '(セブン|ローソン|ファミリーマート|ファミマ|ミニストップ|デイリーヤマザキ|ヤマザキ|ポプラ|セイコーマート|コンビニ|cvs)' then 'cvs'
         when name_n ~* '(美容|理容|サロン|salon|ヘア|hair|ネイル|nail|エステ|まつ|整体|整骨|接骨|鍼|マッサージ|バーバー|barber)' then 'beauty'
         when name_n ~* '(ネットカフェ|ネカフェ|まんが|漫画|カラオケ|ジム|gym|フィットネス|fitness|プール|スポーツ|ゴルフ|ボウリング|シネマ|映画|パチンコ|ゲーム|アミューズ|温泉|銭湯|サウナ)' then 'leisure'
         when name_n ~* '(病院|クリニック|医院|診療所|歯科|薬局|病棟|外来|手術|ナース)' then 'medical'
         when name_n ~* '(ホームセンター|スーパー|ドラッグ)' then 'retail'
         when name_n ~* '(介護|ケア|デイ|老人|特養|老健|グループホーム|ホーム|訪問|看護|福祉|施設|サ高住|多機能|ショート|障害|障がい|就労|ヘルパー|生活支援)' then 'care'
         when name_n ~* '(保育|こども|子ども|子供|幼稚|学童|児童|キッズ|kids|塾|学習|スクール|school|教室|学校|学園|園)' then 'nursery'
         when name_n ~* '(ホテル|hotel|旅館|民宿|ゲストハウス|ホステル|hostel)' then 'hotel'
         when name_n ~* '(食堂|カフェ|cafe|café|喫茶|珈琲|コーヒー|coffee|レストラン|restaurant|居酒屋|酒場|バル|ダイニング|dining|キッチン|kitchen|ラーメン|らーめん|拉麺|そば|蕎麦|うどん|寿司|鮨|すし|焼肉|焼鳥|焼き鳥|やきとり|串|食|ベーカリー|bakery|パン|弁当|ピザ|pizza|バーガー|burger|中華|料理|亭|厨房|bar|バー)' then 'food'
         when name_n ~* '(ストア|store|ショップ|shop|マート|mart|書店|本屋|アパレル|販売|売場|売り場)' then 'retail'
         when name_n ~* '(倉庫|物流|配送|配達|運送|工場|製造|新聞)' then 'logistics'
         when name_n ~* '(コール|オペレーター|事務|受付|オフィス|office)' then 'office'
         when name_n ~* '(警備|清掃|ビルメン)' then 'security'
         else 'unknown'
       end as industry
  from a_active;

-- 使われている店舗の勤務。名前・説明は NFKC にそろえる（半角カナ・全角英数の揺れ）
create temp table a_pat as
select p.id,
       p.tenant_id,
       p.kind,
       p.pair_pattern_id,
       normalize(trim(p.name), nfkc) as name_n,
       nullif(normalize(trim(coalesce(p.description, '')), nfkc), '') as desc_n,
       upper(coalesce(p.color_hex, '#FFFFFF')) as color,
       row_number() over (partition by p.tenant_id order by p.position nulls last, p.id) as ord,
       coalesce(u.shifts, 0) as shifts,
       coalesce(u.shifts, 0)::numeric / a.shifts as share
  from patterns p
  join a_active a on a.tenant_id = p.tenant_id
  left join a_pattern_use u on u.pattern_id = p.id;

create temp view a_industry_size as
select industry, count(*) as n from a_industry group by industry;

-- 1. 業種の分布 ----------------------------------------------------------------
-- 業種ごとの店舗数・在籍スタッフ数・作成周期。recent = 直近 2 年に作られた店舗

create temp view q1 as
select i.industry,
       count(*) as tenants,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct,
       count(*) filter (where a.created_at >= current_date - 730) as recent,
       percentile_cont(0.5) within group (order by a.staffs) as median_staffs,
       count(*) filter (where a.shift_cycle = 0) as cycle_month,
       count(*) filter (where a.shift_cycle = 1) as cycle_half_month,
       count(*) filter (where a.shift_cycle = 2) as cycle_two_week,
       count(*) filter (where a.shift_cycle = 3) as cycle_week
  from a_active a
  join a_industry i using (tenant_id)
 group by i.industry
 order by tenants desc;

-- 2. 業種ごとの勤務の名前（上位 40） ----------------------------------------------
-- pct_tenants = その業種で、この名前の勤務を使っている店舗の割合
-- avg_share_pct = 使っている店舗でのアサインの割合の平均 / avg_order = 一覧の何番目に置かれているか

create temp view q2 as
select industry, kind, name_n, tenants, pct_tenants, avg_share_pct, avg_order, top_color, top_desc
  from (select i.industry,
               case p.kind when 0 then 'workday' when 1 then 'dayoff' end as kind,
               p.name_n,
               count(distinct p.tenant_id) as tenants,
               round(100.0 * count(distinct p.tenant_id) / s.n, 1) as pct_tenants,
               round(100 * avg(p.share), 1) as avg_share_pct,
               round(avg(p.ord), 1) as avg_order,
               mode() within group (order by p.color) as top_color,
               mode() within group (order by p.desc_n) as top_desc,
               row_number() over (partition by i.industry order by count(distinct p.tenant_id) desc) as rn
          from a_pat p
          join a_industry i using (tenant_id)
          join a_industry_size s using (industry)
         where p.shifts > 0
         group by i.industry, p.kind, p.name_n, s.n
        having count(distinct p.tenant_id) >= 5) x
 where rn <= 40
 order by industry, tenants desc;

-- 3. 業種 × 勤務の名前ごとの説明（時間）の内訳 --------------------------------------
-- 各業種の上位 15 の名前について、3 店舗以上で使われた説明だけ

create temp view q3 as
with top_names as (
  select industry, name_n
    from (select i.industry, p.name_n,
                 row_number() over (partition by i.industry order by count(distinct p.tenant_id) desc) as rn
            from a_pat p join a_industry i using (tenant_id)
           where p.shifts > 0
           group by i.industry, p.name_n) x
   where rn <= 15
)
select i.industry, p.name_n, p.desc_n, count(distinct p.tenant_id) as tenants
  from a_pat p
  join a_industry i using (tenant_id)
  join top_names t on t.industry = i.industry and t.name_n = p.name_n
 where p.shifts > 0 and p.desc_n is not null
 group by i.industry, p.name_n, p.desc_n
having count(distinct p.tenant_id) >= 3
 order by i.industry, p.name_n, tenants desc;

-- 4. 1 店舗あたりの勤務の数 -------------------------------------------------------
-- defined = 登録している数 / used = 直近 1 年に 1 コマ以上使った数

create temp view q4 as
with per_tenant as (
  select p.tenant_id,
         count(*) filter (where p.kind = 0) as workday_defined,
         count(*) filter (where p.kind = 0 and p.shifts > 0) as workday_used,
         count(*) filter (where p.kind = 1) as dayoff_defined,
         count(*) filter (where p.kind = 1 and p.shifts > 0) as dayoff_used
    from a_pat p
   group by p.tenant_id
)
select i.industry,
       count(*) as tenants,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by workday_defined) as workday_defined_p25_50_75,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by workday_used) as workday_used_p25_50_75,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by dayoff_defined) as dayoff_defined_p25_50_75,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by dayoff_used) as dayoff_used_p25_50_75,
       round(100.0 * count(*) filter (where dayoff_used = 0) / count(*), 1) as pct_no_dayoff_used
  from per_tenant
  join a_industry i using (tenant_id)
 group by i.industry
 order by tenants desc;

-- 5. ペア（夜勤 → 明け など） -----------------------------------------------------
-- 同じ店舗の中のペアだけ（v1 は FK が無く、他店舗を指す行がある。021 §5.2）

create temp view q5 as
with pairs as (
  select p.tenant_id, p.name_n as from_name, q.name_n as to_name,
         case q.kind when 0 then 'workday' when 1 then 'dayoff' end as to_kind
    from a_pat p
    join a_pat q on q.id = p.pair_pattern_id and q.tenant_id = p.tenant_id
   where p.shifts > 0
)
select i.industry, from_name, to_name, to_kind,
       count(distinct tenant_id) as tenants,
       round(100.0 * count(distinct tenant_id) / s.n, 1) as pct_tenants
  from pairs
  join a_industry i using (tenant_id)
  join a_industry_size s using (industry)
 group by i.industry, from_name, to_name, to_kind, s.n
having count(distinct tenant_id) >= 3
 order by i.industry, tenants desc;

-- 6. 1 人で複数の店舗を持つ人 -----------------------------------------------------
-- 業種を店舗に持たせる判断（§2-1）の裏付け。industries は unknown を除いた業種の数

create temp view q6 as
with per_user as (
  select a.user_id,
         count(*) as active_tenants,
         count(distinct i.industry) filter (where i.industry <> 'unknown') as industries
    from a_active a
    join a_industry i using (tenant_id)
   group by a.user_id
)
select active_tenants, industries, count(*) as users
  from per_user
 group by active_tenants, industries
 order by active_tenants, industries;

-- 7. 業種を問わない勤務の名前（上位 100） ------------------------------------------
-- 「その他」のテンプレートと、業種の推定から漏れた店舗の傾向を見る。unknown_tenants = 業種不明の店舗での数

create temp view q7 as
select case p.kind when 0 then 'workday' when 1 then 'dayoff' end as kind,
       p.name_n,
       count(distinct p.tenant_id) as tenants,
       count(distinct p.tenant_id) filter (where i.industry = 'unknown') as unknown_tenants,
       round(100.0 * count(distinct p.tenant_id) / (select count(*) from a_active), 1) as pct_tenants,
       mode() within group (order by p.color) as top_color,
       mode() within group (order by p.desc_n) as top_desc
  from a_pat p
  join a_industry i using (tenant_id)
 where p.shifts > 0
 group by p.kind, p.name_n
having count(distinct p.tenant_id) >= 5
 order by tenants desc
 limit 100;

-- 8. 手元で見るだけ: 推定の当たり外れを確かめる店舗名の見本 ----------------------------
-- 業種ごとに 30 件、unknown は 300 件。共有しない

create temp view private_sample_names as
select industry, name_n
  from (select i.industry, a.name_n,
               row_number() over (partition by i.industry order by random()) as rn
          from a_active a
          join a_industry i using (tenant_id)) x
 where rn <= case when industry = 'unknown' then 300 else 30 end
 order by industry, name_n;

-- 書き出し ---------------------------------------------------------------------

\copy (select * from q1) to 'q1_industries.csv' csv header
\copy (select * from q2) to 'q2_names_by_industry.csv' csv header
\copy (select * from q3) to 'q3_descriptions.csv' csv header
\copy (select * from q4) to 'q4_counts.csv' csv header
\copy (select * from q5) to 'q5_pairs.csv' csv header
\copy (select * from q6) to 'q6_multi_tenant.csv' csv header
\copy (select * from q7) to 'q7_names_overall.csv' csv header
\copy (select * from private_sample_names) to 'private_sample_names.csv' csv header
