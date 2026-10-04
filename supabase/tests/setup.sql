-- 初期設定（014）の DB 側を固定するテスト（npx supabase test db）。
-- 完了日時のトリガ・埋め戻しの条件・save_setup_patterns / complete_setup の検査（完了済み・スタッフあり・他テナント・anon）。
-- 同時実行（for update のロック）は 1 接続では試せないので、手動で確かめる（014 §6.3）。
begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

-- ---------------------------------------------------------------------------
-- 準備（postgres として実行）
-- ---------------------------------------------------------------------------
\set user_a '''aaaaaaaa-0000-0000-0000-0000000014aa'''
\set user_b '''bbbbbbbb-0000-0000-0000-0000000014bb'''
-- 新規（何も無い）
\set t_new '''aaaaaaaa-1414-0000-0000-000000000001'''
-- 新規（勤務を入れないまま完成を試す）
\set t_empty '''aaaaaaaa-1414-0000-0000-000000000002'''
-- 全員退職したスタッフ + 勤務 + 過去のシフト（v1 から移る店にありうる）
\set t_retired '''aaaaaaaa-1414-0000-0000-000000000003'''
-- スタッフはいるが勤務 0
\set t_staffonly '''aaaaaaaa-1414-0000-0000-000000000004'''
-- 勤務だけ（スタッフ 0）
\set t_patonly '''aaaaaaaa-1414-0000-0000-000000000005'''
-- B の店舗
\set t_b '''bbbbbbbb-1414-0000-0000-000000000001'''

\set staff_retired '''aaaaaaaa-1414-2222-0000-000000000003'''
\set pattern_retired '''aaaaaaaa-1414-3333-0000-000000000003'''
\set p_early '''aaaaaaaa-1414-4444-0000-000000000001'''
\set p_night '''aaaaaaaa-1414-4444-0000-000000000002'''
\set p_after '''aaaaaaaa-1414-4444-0000-000000000003'''

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', :user_a, 'authenticated', 'authenticated', 'setup-a@example.test',
   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :user_b, 'authenticated', 'authenticated', 'setup-b@example.test',
   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.tenants (id, owner_id, name) values
  (:t_new, :user_a, '新しい店'),
  (:t_empty, :user_a, '空の店'),
  (:t_retired, :user_a, '退職者だけの店'),
  (:t_staffonly, :user_a, 'スタッフだけの店'),
  (:t_patonly, :user_a, '勤務だけの店'),
  (:t_b, :user_b, 'Bの店');

insert into public.patterns (id, tenant_id, name) values (:pattern_retired, :t_retired, '早番');
insert into public.staffs (id, tenant_id, name, retired_at) values (:staff_retired, :t_retired, '辞めた人', now());
insert into public.shifts (tenant_id, staff_id, pattern_id, date) values (:t_retired, :staff_retired, :pattern_retired, '2026-01-05');
insert into public.staffs (tenant_id, name) values (:t_staffonly, 'いる人');
insert into public.patterns (tenant_id, name) values (:t_patonly, '日勤');

-- ---------------------------------------------------------------------------
-- ユーザー A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', 'aaaaaaaa-0000-0000-0000-0000000014aa'), true);

-- 準備中でもスタッフがいれば（退職者だけでも）、初期設定の書き込みは DB が拒む（014 §5.2）
select throws_ok(
  format($$select public.save_setup_patterns(%L, '[{"id":"aaaaaaaa-1414-4444-0000-0000000000ff","name":"遅番","description":"","color_hex":"#3F51B5","kind":"workday","pair_id":null}]'::jsonb)$$, :t_retired),
  'P0001', 'save_setup_patterns: has staffs',
  'save_setup_patterns: 退職者だけでもスタッフがいれば has staffs（過去のシフトを消さない）');
select is((select count(*) from public.shifts where tenant_id = :t_retired), 1::bigint,
  'save_setup_patterns: 拒んだあとも過去のシフトは残っている');
select throws_ok(
  format($$select public.complete_setup(%L, array['新人'])$$, :t_staffonly),
  'P0001', 'complete_setup: has staffs',
  'complete_setup: スタッフがいれば has staffs（二重にしない）');

-- save_setup_patterns: 保存（置き換え）
select is(
  public.save_setup_patterns(:t_new, format(
    '[{"id":"%s","name":"早番","description":"7-16時","color_hex":"#FF5722","kind":"workday","pair_id":null},'
    '{"id":"%s","name":"夜勤","description":"16-9時","color_hex":"#607D8B","kind":"workday","pair_id":"%s"},'
    '{"id":"%s","name":"明け","description":"","color_hex":"#9E9E9E","kind":"dayoff","pair_id":null}]',
    'aaaaaaaa-1414-4444-0000-000000000001', 'aaaaaaaa-1414-4444-0000-000000000002',
    'aaaaaaaa-1414-4444-0000-000000000003', 'aaaaaaaa-1414-4444-0000-000000000003')::jsonb),
  3, 'save_setup_patterns: 入れた件数を返す');
select is((select pair_pattern_id from public.patterns where id = :p_night), :p_after::uuid,
  'save_setup_patterns: 夜勤のペアが明けに張られる');
select is((select array_agg(name order by position) from public.patterns where tenant_id = :t_new),
  array['早番', '夜勤', '明け'], 'save_setup_patterns: position は配列の順');
select is((select description from public.patterns where id = :p_after), null,
  'save_setup_patterns: 空の説明は null');
select is(
  public.save_setup_patterns(:t_new, format(
    '[{"id":"%s","name":"早番","description":"7-16時","color_hex":"#FF5722","kind":"workday","pair_id":null},'
    '{"id":"%s","name":"有給","description":"","color_hex":"#4CAF50","kind":"dayoff","pair_id":null}]',
    'aaaaaaaa-1414-4444-0000-000000000011', 'aaaaaaaa-1414-4444-0000-000000000012')::jsonb),
  2, 'save_setup_patterns: 2 回目も通る');
select is((select count(*) from public.patterns where tenant_id = :t_new), 2::bigint,
  'save_setup_patterns: 2 回目は置き換わる（件数が増えない）');
select throws_ok(
  format($$select public.save_setup_patterns(%L, '[]'::jsonb)$$, :t_new),
  'P0001', 'save_setup_patterns: no patterns', 'save_setup_patterns: 0 件は no patterns');
select throws_ok(
  format($$select public.save_setup_patterns(%L, '[{"id":"bbbbbbbb-1414-4444-0000-000000000001","name":"B番","description":"","color_hex":"#FFFFFF","kind":"workday","pair_id":null}]'::jsonb)$$, :t_b),
  'P0001', 'save_setup_patterns: tenant not found', 'save_setup_patterns: 他テナントは tenant not found');

-- complete_setup
select throws_ok(
  format($$select public.complete_setup(%L, array['新人'])$$, :t_empty),
  'P0001', 'complete_setup: no patterns', 'complete_setup: 勤務 0 件は no patterns');
select throws_ok(
  format($$select public.complete_setup(%L, array[]::text[])$$, :t_patonly),
  'P0001', 'complete_setup: no staffs', 'complete_setup: 名前 0 件は no staffs');
select throws_ok(
  format($$select public.complete_setup(%L, array['Bの新人'])$$, :t_b),
  'P0001', 'complete_setup: tenant not found', 'complete_setup: 他テナントは tenant not found');
select is(public.complete_setup(:t_new, array['山田 花子', '佐藤 健', '佐藤 健']), 3,
  'complete_setup: 作ったスタッフの人数を返す（同じ名前も許す）');
select is((select array_agg(name order by position) from public.staffs where tenant_id = :t_new),
  array['山田 花子', '佐藤 健', '佐藤 健'], 'complete_setup: 名前の順に並ぶ');
select is((select count(*) from public.staff_patterns where tenant_id = :t_new), 6::bigint,
  'complete_setup: staff_patterns は人数 × 勤務数');
select is((select max_work_week from public.staffs where tenant_id = :t_new limit 1), 5::smallint,
  'complete_setup: 週の上限は DB の既定値');
select isnt((select setup_completed_at from public.tenants where id = :t_new), null,
  'complete_setup: 完了日時が入る');
select throws_ok(
  format($$select public.complete_setup(%L, array['もう一人'])$$, :t_new),
  'P0001', 'complete_setup: setup completed',
  'complete_setup: 2 回目は setup completed（immutable ではない）');
select throws_ok(
  format($$select public.save_setup_patterns(%L, '[{"id":"aaaaaaaa-1414-4444-0000-0000000000ee","name":"遅番","description":"","color_hex":"#3F51B5","kind":"workday","pair_id":null}]'::jsonb)$$, :t_new),
  'P0001', 'save_setup_patterns: setup completed', 'save_setup_patterns: 完了後は setup completed');

-- 完了日時は変えられない（014 §5.1）。ほかの列はいままでどおり変えられる
select throws_ok(
  format($$update public.tenants set setup_completed_at = null where id = %L$$, :t_new),
  'P0001', 'setup_completed_at is immutable', '完了日時は null に戻せない');
select throws_ok(
  format($$update public.tenants set setup_completed_at = now() - interval '1 day' where id = %L$$, :t_new),
  'P0001', 'setup_completed_at is immutable', '完了日時はほかの日時にも変えられない');
select lives_ok(
  format($$update public.tenants set name = '新しい店（改）', start_of_week = 1 where id = %L$$, :t_new),
  '完了済みの店舗でも、ほかの列は変えられる');
select lives_ok(
  format($$update public.tenants set setup_completed_at = now() where id = %L$$, :t_b),
  '他テナントの完了日時を書こうとしても例外にはならない（RLS で 0 行。値は下で postgres として確かめる）');

-- ---------------------------------------------------------------------------
-- anon
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);

select throws_ok(
  $$select public.save_setup_patterns('aaaaaaaa-1414-0000-0000-000000000002', '[]'::jsonb)$$,
  '42501', null, 'anon は save_setup_patterns を実行できない');
select throws_ok(
  $$select public.complete_setup('aaaaaaaa-1414-0000-0000-000000000002', array['x'])$$,
  '42501', null, 'anon は complete_setup を実行できない');

-- ---------------------------------------------------------------------------
-- 埋め戻しの条件（migration に追記した SQL と同じ形。postgres として流す）
-- ---------------------------------------------------------------------------
reset role;
update public.tenants t
   set setup_completed_at = t.created_at
 where t.setup_completed_at is null
   and exists (select 1 from public.staffs s where s.tenant_id = t.id);

select isnt((select setup_completed_at from public.tenants where id = :t_retired), null,
  '埋め戻し: 退職者だけの店舗は完了');
select isnt((select setup_completed_at from public.tenants where id = :t_staffonly), null,
  '埋め戻し: スタッフはいるが勤務 0 の店舗は完了');
select is((select setup_completed_at from public.tenants where id = :t_patonly), null,
  '埋め戻し: 勤務だけ（スタッフ 0）の店舗は準備中のまま');
select is((select setup_completed_at from public.tenants where id = :t_b), null,
  '他テナント（B）の完了日時は A の update で変わっていない');

select * from finish();
rollback;
