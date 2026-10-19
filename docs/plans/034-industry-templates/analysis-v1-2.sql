-- 034 §3.5: 2 回目の集計。1 回目（analysis-v1.sql）で残った 3 つの弱いところを埋める。
--
-- 1. 業種が 76% 不明 → 店舗名ではなく、使っている勤務の「形」（早番・遅番型 / 午前・午後型 / 夜勤型 …）で分ける（r1）
-- 2. 時間は説明の最頻値しか見ていない → 名前と説明から開始・終了の時刻を読み取って数える（r2）
-- 3. テンプレートの案を採点していない → いまの案と新しい案が、何割の店舗の勤務と合うかを数える（r5）
--
-- ほかに、店舗を作った直後とあとから足した勤務の違い（r3）と、お休みを働く日で作っている店舗の規模（r4）、
-- お休みの名前の使われ方（r6）を見る。
--
-- 流し方は 1 回目と同じ（analysis-v1-base.sql を同じディレクトリに置いたまま）:
--   cd ~/assift-034 && psql "$V1_DATABASE_URL" -f <repo>/docs/plans/034-industry-templates/analysis-v1-2.sql
--
-- 出力はすべて集計（r*.csv）。共有してよい。名前・時間は 3 店舗以上で使われたものだけを出す。

\set ON_ERROR_STOP on
\timing on

\ir analysis-v1-base.sql

-- 0. 名前の言い換えをまとめる ------------------------------------------------------
-- 「早」「早出」→ 早番、「AM」→ 午前、「休」「公休」→ 休み のように、同じ意味の名前を 1 つの名前（canon）に寄せる。
-- 寄せ先に無い名前はそのまま

create temp table a_alias (alias text primary key, canon text not null);
insert into a_alias (alias, canon) values
  ('早番', '早番'), ('早', '早番'), ('早出', '早番'),
  ('遅番', '遅番'), ('遅', '遅番'), ('遅出', '遅番'),
  ('中番', '中番'), ('中', '中番'),
  ('日勤', '日勤'), ('日', '日勤'), ('1日', '日勤'),
  ('通し', '通し'), ('フル', '通し'),
  ('夜勤', '夜勤'), ('夜', '夜勤'), ('当直', '夜勤'), ('夜勤入り', '夜勤'), ('入り', '夜勤'), ('入', '夜勤'),
  ('明け', '明け'), ('明', '明け'), ('夜勤明け', '明け'), ('明', '明け'),
  ('午前', '午前'), ('am', '午前'),
  ('午後', '午後'), ('pm', '午後'),
  ('出勤', '出勤'), ('出', '出勤'), ('○', '出勤'), ('〇', '出勤'), ('◯', '出勤'),
  ('ランチ', 'ランチ'), ('ディナー', 'ディナー'),
  ('休み', '休み'), ('休', '休み'), ('公休', '公休'), ('休日', '休み'), ('お休み', '休み'), ('×', '休み'),
  ('希望休', '希望休'), ('希休', '希望休'), ('希望', '希望休'),
  ('有給', '有給'), ('有休', '有給'), ('有', '有給'), ('有給休暇', '有給'),
  ('定休日', '定休日'), ('半休', '半休')
on conflict (alias) do nothing;

-- お休みらしい名前（区分が workday でも、働いた日として扱わない）
create temp table a_rest_canon (canon text primary key);
insert into a_rest_canon values ('休み'), ('公休'), ('希望休'), ('有給'), ('定休日'), ('半休');

-- 使われている勤務（直近 1 年に 1 コマ以上）に、寄せた名前と見た目の分類を付ける
create temp table a_pat2 as
select p.*,
       coalesce(al.canon, p.name_n) as canon,
       (rc.canon is not null) as restlike,
       -- 「10-16」「9:00-」「17時」「18:30」のように、時刻そのものを名前にした勤務
       (p.name_n ~ '^\d{1,2}([:：]\d{2}|時半?)?\s*([-~〜‐ーから]|$)') as time_named,
       -- 「A」「B」「1」「2」「①」のような記号の名前
       (p.name_n ~ '^([A-Za-z]|\d|[①-⑳])$') as code_named
  from a_pat p
  left join a_alias al on al.alias = lower(p.name_n)
  left join a_rest_canon rc on rc.canon = coalesce(al.canon, p.name_n)
 where p.shifts > 0;

-- 働いた日の勤務（区分が workday で、名前がお休みらしくないもの）
create temp view a_work as
select * from a_pat2 where kind = 0 and not restlike;

-- 1 店舗 1 行の特徴
create temp table a_shape as
select a.tenant_id,
       i.industry,
       a.created_at >= current_date - 730 as recent,
       count(w.id) as n_work,
       bool_or(w.canon = '早番') as has_early,
       bool_or(w.canon = '遅番') as has_late,
       bool_or(w.canon = '中番') as has_mid,
       bool_or(w.canon = '日勤') as has_day,
       bool_or(w.canon = '通し') as has_full,
       bool_or(w.canon = '夜勤') as has_night,
       bool_or(w.canon = '明け') as has_ake,
       bool_or(w.canon = '午前') as has_am,
       bool_or(w.canon = '午後') as has_pm,
       bool_or(w.canon = '出勤') as has_shukkin,
       bool_or(w.canon in ('ランチ', 'ディナー')) as has_lunch_dinner,
       count(w.id) filter (where w.time_named) as n_time,
       count(w.id) filter (where w.code_named) as n_code
  from a_active a
  join a_industry i using (tenant_id)
  left join a_work w on w.tenant_id = a.tenant_id
 group by a.tenant_id, i.industry, a.created_at;

-- 店舗の形（上から順に当てる）
create temp view a_shape_label as
select s.*,
       case
         when coalesce(has_night, false) then 'night'          -- 夜勤あり
         when coalesce(has_am and has_pm, false) then 'am_pm'  -- 午前・午後
         when coalesce(has_early or has_late, false) then
           case when coalesce(has_mid, false) then 'early_mid_late' else 'early_late' end
         when coalesce(has_day, false) then 'day'              -- 日勤（早番・遅番なし）
         when coalesce(has_shukkin, false) then 'shukkin'      -- 出勤・○ だけで、誰が出る日かを付ける
         when n_work > 0 and n_time * 2 >= n_work then 'time_named'
         when n_work > 0 and n_code * 2 >= n_work then 'code_named'
         when n_work = 0 then 'no_work'                        -- 働く日の勤務が無い（お休みらしい名前だけ）
         else 'other'
       end as shape
  from a_shape s;

-- r1. 業種 × 形 -----------------------------------------------------------------
-- industry = 'ALL' は全体。recent = 直近 2 年に作られた店舗

create temp view r1 as
with rows as (
  select industry, shape, recent from a_shape_label
  union all
  select 'ALL', shape, recent from a_shape_label
)
select industry, shape,
       count(*) as tenants,
       round(100.0 * count(*) / sum(count(*)) over (partition by industry), 1) as pct,
       count(*) filter (where recent) as recent
  from rows
 group by industry, shape
 order by industry, tenants desc;

-- r1b. 業種ごとの特徴の割合 -------------------------------------------------------
-- 形は 1 つに決めるので、重なり（早番と日勤の両方がある、など）はこちらで見る。
-- pct_time_major = 働く日の勤務の半分以上が時刻の名前の店舗

create temp view r1b as
with rows as (
  select * from a_shape
  union all
  select tenant_id, 'ALL', recent, n_work, has_early, has_late, has_mid, has_day, has_full, has_night, has_ake,
         has_am, has_pm, has_shukkin, has_lunch_dinner, n_time, n_code
    from a_shape
)
select industry,
       count(*) as tenants,
       round(100.0 * count(*) filter (where has_early) / count(*), 1) as pct_early,
       round(100.0 * count(*) filter (where has_late) / count(*), 1) as pct_late,
       round(100.0 * count(*) filter (where has_mid) / count(*), 1) as pct_mid,
       round(100.0 * count(*) filter (where has_day) / count(*), 1) as pct_day,
       round(100.0 * count(*) filter (where has_full) / count(*), 1) as pct_full,
       round(100.0 * count(*) filter (where has_night) / count(*), 1) as pct_night,
       round(100.0 * count(*) filter (where has_ake) / count(*), 1) as pct_ake,
       round(100.0 * count(*) filter (where has_am and has_pm) / count(*), 1) as pct_am_pm,
       round(100.0 * count(*) filter (where has_shukkin) / count(*), 1) as pct_shukkin,
       round(100.0 * count(*) filter (where has_lunch_dinner) / count(*), 1) as pct_lunch_dinner,
       round(100.0 * count(*) filter (where n_work > 0 and n_time * 2 >= n_work) / count(*), 1) as pct_time_major,
       round(100.0 * count(*) filter (where n_work > 0 and n_code * 2 >= n_work) / count(*), 1) as pct_code_major
  from rows
 group by industry
 order by tenants desc;

-- r2. 勤務の時刻 ----------------------------------------------------------------
-- 説明 → 名前の順に、最初に見つかった「開始-終了」を読む。30 分単位に丸める（8:45 → 8.5、13:15 → 13.0）。
-- 4 桁（0845-1815）を先に読み、次に「9-17」「9:00〜18:00」「9時半から18時」を読む

create temp table a_time as
with src as (
  select w.*, coalesce(w.desc_n, '') || ' ' || w.name_n as txt
    from a_work w
   where w.canon in ('早番', '遅番', '中番', '日勤', '通し', '夜勤', '午前', '午後', 'ランチ', 'ディナー')
),
m as (
  select s.*,
         regexp_match(s.txt, '(?<!\d)(\d{2})(\d{2})\s*[-~〜‐ー]\s*(\d{2})(\d{2})(?!\d)') as m4,
         regexp_match(s.txt, '(?<!\d)(\d{1,2})(?:[:：](\d{2})|時(半)?)?\s*(?:[-~〜‐ー]|から)\s*(\d{1,2})(?:[:：](\d{2})|時(半)?)?') as mg
    from src s
)
select tenant_id, industry, canon, start_h, end_h
  from (select m.tenant_id, i.industry, m.canon,
               case when m4 is not null then m4[1]::int + floor(m4[2]::int / 30.0) * 0.5
                    when mg is not null then mg[1]::int + case when mg[3] is not null then 0.5 else floor(coalesce(mg[2], '0')::int / 30.0) * 0.5 end
               end as start_h,
               case when m4 is not null then m4[3]::int + floor(m4[4]::int / 30.0) * 0.5
                    when mg is not null then mg[4]::int + case when mg[6] is not null then 0.5 else floor(coalesce(mg[5], '0')::int / 30.0) * 0.5 end
               end as end_h
          from m
          join a_industry i using (tenant_id)) x
 where start_h between 0 and 24 and end_h between 0 and 30;

-- 名前 × 開始 × 終了。industry = 'ALL' は全体
create temp view r2 as
with rows as (
  select industry, canon, start_h, end_h, tenant_id from a_time
  union all
  select 'ALL', canon, start_h, end_h, tenant_id from a_time
),
totals as (
  select industry, canon, count(distinct tenant_id) as with_time from rows group by industry, canon
)
select r.industry, r.canon, r.start_h, r.end_h,
       count(distinct r.tenant_id) as tenants,
       t.with_time,
       round(100.0 * count(distinct r.tenant_id) / t.with_time, 1) as pct_of_with_time
  from rows r
  join totals t using (industry, canon)
 group by r.industry, r.canon, r.start_h, r.end_h, t.with_time
having count(distinct r.tenant_id) >= 3
 order by r.industry, r.canon, tenants desc;

-- r2b. 名前ごとの開始・終了の分布（四分位） -------------------------------------------
create temp view r2b as
with rows as (
  select industry, canon, start_h, end_h from a_time
  union all
  select 'ALL', canon, start_h, end_h from a_time
)
select industry, canon,
       count(*) as patterns,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by start_h) as start_p25_50_75,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by end_h) as end_p25_50_75
  from rows
 group by industry, canon
having count(*) >= 5
 order by industry, canon;

-- r3. 店舗を作った直後の勤務と、あとから足した勤務 -------------------------------------
-- initial = 店舗を作ってから 1 日以内に作った勤務 / later = 30 日より後に作った勤務。
-- あとから足される名前は、テンプレートに入れておけば手間が減る候補

create temp view r3 as
with rows as (
  select i.industry, w.tenant_id, w.canon,
         case when w.created_at <= w.tenant_created_at + interval '1 day' then 'initial'
              when w.created_at > w.tenant_created_at + interval '30 days' then 'later'
         end as phase
    from a_pat2 w
    join a_industry i using (tenant_id)
),
both_rows as (
  select * from rows where phase is not null
  union all
  select 'ALL', tenant_id, canon, phase from rows where phase is not null
),
sizes as (
  select industry, count(*) as n from a_industry group by industry
  union all
  select 'ALL', count(*) from a_industry
)
select b.industry, b.phase, b.canon,
       count(distinct b.tenant_id) as tenants,
       round(100.0 * count(distinct b.tenant_id) / s.n, 1) as pct_tenants
  from both_rows b
  join sizes s using (industry)
 group by b.industry, b.phase, b.canon, s.n
having count(distinct b.tenant_id) >= 5
 order by b.industry, b.phase, tenants desc;

-- r3b. 1 店舗あたりの数: 作った直後 / いま（使っているもの）
create temp view r3b as
with per_tenant as (
  select a.tenant_id, i.industry,
         count(w.id) filter (where w.created_at <= w.tenant_created_at + interval '1 day') as initial_used,
         count(w.id) as used,
         count(w.id) filter (where w.created_at > w.tenant_created_at + interval '30 days') as later_used
    from a_active a
    join a_industry i using (tenant_id)
    left join a_pat2 w on w.tenant_id = a.tenant_id
   group by a.tenant_id, i.industry
),
rows as (
  select * from per_tenant
  union all
  select tenant_id, 'ALL', initial_used, used, later_used from per_tenant
)
select industry,
       count(*) as tenants,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by initial_used) as initial_p25_50_75,
       percentile_cont(array[0.25, 0.5, 0.75]) within group (order by used) as used_p25_50_75,
       round(100.0 * count(*) filter (where later_used > 0) / count(*), 1) as pct_added_later
  from rows
 group by industry
 order by tenants desc;

-- r4. お休みらしい名前を働く日で作っている店舗の規模（§5.3） --------------------------------
-- rest_as_work = お休みらしい名前の勤務を workday で使っている / dayoff_used = dayoff の勤務を使っている /
-- assist = 直近 1 年に自動アサインを使った（assist_token のある行がある）。
-- rest_share_pct = その店舗のアサインのうち、workday のお休みらしい勤務の割合（中央値）

create temp table a_assist as
select distinct p.tenant_id
  from shifts s
  join patterns p on p.id = s.pattern_id
 where s.assist_token is not null
   and s.date >= current_date - 365;

create temp view r4 as
with per_tenant as (
  select a.tenant_id,
         bool_or(w.kind = 0 and w.restlike) as rest_as_work,
         bool_or(w.kind = 1) as dayoff_used,
         (aa.tenant_id is not null) as assist,
         coalesce(sum(w.share) filter (where w.kind = 0 and w.restlike), 0) as rest_share
    from a_active a
    left join a_pat2 w on w.tenant_id = a.tenant_id
    left join a_assist aa on aa.tenant_id = a.tenant_id
   group by a.tenant_id, aa.tenant_id
)
select coalesce(rest_as_work, false) as rest_as_work,
       coalesce(dayoff_used, false) as dayoff_used,
       assist,
       count(*) as tenants,
       round(100 * percentile_cont(0.5) within group (order by rest_share)::numeric, 1) as rest_share_pct_median
  from per_tenant
 group by 1, 2, 3
 order by 1, 2, 3;

-- r5. テンプレートの採点 -----------------------------------------------------------
-- 店舗の働く日の勤務（寄せた名前）に、テンプレートの働く日の名前が 2/3 以上あれば「合う」とする
-- （3 行なら 2 行、5 行なら 4 行）。cur_* = いまのテンプレート / new_* = §5.2 の案

create temp table a_tpl (tpl text, canon text, primary key (tpl, canon));
insert into a_tpl values
  ('cur_food', '早番'), ('cur_food', '遅番'), ('cur_food', '通し'),
  ('cur_retail', '朝'), ('cur_retail', '日中'), ('cur_retail', '夕方'), ('cur_retail', '夜勤'),
  ('cur_care', '早番'), ('cur_care', '日勤'), ('cur_care', '遅番'), ('cur_care', '夜勤'), ('cur_care', '明け'),
  ('cur_nursery', '早番'), ('cur_nursery', '中番'), ('cur_nursery', '遅番'),
  ('cur_other', '日勤'),
  ('new_early_mid_late', '早番'), ('new_early_mid_late', '中番'), ('new_early_mid_late', '遅番'),
  ('new_clinic', '日勤'), ('new_clinic', '午前'), ('new_clinic', '午後'),
  ('new_other', '日勤'), ('new_other', '早番'), ('new_other', '遅番'),
  ('alt_early_late', '早番'), ('alt_early_late', '遅番'),
  ('alt_care_no_ake', '早番'), ('alt_care_no_ake', '日勤'), ('alt_care_no_ake', '遅番'), ('alt_care_no_ake', '夜勤');

create temp view r5 as
with tpl_size as (
  select tpl, count(*) as size from a_tpl group by tpl
),
tenant_names as (
  select distinct tenant_id, canon from a_work
),
matched as (
  select a.tenant_id, i.industry, t.tpl, ts.size,
         count(tn.canon) as hit
    from a_active a
    join a_industry i using (tenant_id)
    cross join (select distinct tpl from a_tpl) t
    join tpl_size ts using (tpl)
    left join a_tpl tc on tc.tpl = t.tpl
    left join tenant_names tn on tn.tenant_id = a.tenant_id and tn.canon = tc.canon
   group by a.tenant_id, i.industry, t.tpl, ts.size
),
rows as (
  select industry, tpl, size, hit from matched
  union all
  select 'ALL', tpl, size, hit from matched
)
select industry, tpl,
       count(*) as tenants,
       round(100.0 * count(*) filter (where hit * 3 >= size * 2) / count(*), 1) as pct_fit,
       round(100.0 * count(*) filter (where hit >= 1) / count(*), 1) as pct_any,
       round(100.0 * avg(hit::numeric / size), 1) as avg_hit_pct
  from rows
 group by industry, tpl
 order by industry, pct_fit desc;

-- r6. お休みの名前（区分を問わない） --------------------------------------------------
create temp view r6 as
with per_tenant as (
  select a.tenant_id, i.industry, w.canon
    from a_active a
    join a_industry i using (tenant_id)
    join a_pat2 w on w.tenant_id = a.tenant_id
   where w.restlike
),
rows as (
  select industry, tenant_id, canon from per_tenant
  union all
  select 'ALL', tenant_id, canon from per_tenant
),
sizes as (
  select industry, count(*) as n from a_industry group by industry
  union all
  select 'ALL', count(*) from a_industry
)
select r.industry, r.canon,
       count(distinct r.tenant_id) as tenants,
       round(100.0 * count(distinct r.tenant_id) / s.n, 1) as pct_tenants
  from rows r
  join sizes s using (industry)
 group by r.industry, r.canon, s.n
having count(distinct r.tenant_id) >= 5
 order by r.industry, tenants desc;

-- 書き出し ---------------------------------------------------------------------

\copy (select * from r1) to 'r1_shapes.csv' csv header
\copy (select * from r1b) to 'r1b_features.csv' csv header
\copy (select * from r2) to 'r2_times.csv' csv header
\copy (select * from r2b) to 'r2b_time_quartiles.csv' csv header
\copy (select * from r3) to 'r3_initial_later.csv' csv header
\copy (select * from r3b) to 'r3b_counts.csv' csv header
\copy (select * from r4) to 'r4_rest_as_work.csv' csv header
\copy (select * from r5) to 'r5_template_fit.csv' csv header
\copy (select * from r6) to 'r6_rest_names.csv' csv header
