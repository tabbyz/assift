-- テナント境界の RLS を固定するテスト（npx supabase test db）。
-- RLS はこのアプリで唯一の認可境界なので、別テナントの行が見えない・書けないことを毎回確認する。
--
-- pgtap はテストのトランザクション内で作り、宣言的スキーマには入れない（本番に持ち込まない）。
begin;
create extension if not exists pgtap with schema extensions;

select plan(27);

-- ---------------------------------------------------------------------------
-- 準備（postgres として実行。RLS はテーブル所有者には適用されない）
-- ---------------------------------------------------------------------------
\set user_a '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set user_b '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set tenant_a '''aaaaaaaa-1111-0000-0000-00000000000a'''
\set tenant_b '''bbbbbbbb-1111-0000-0000-00000000000b'''
\set staff_a '''aaaaaaaa-2222-0000-0000-00000000000a'''
\set staff_b '''bbbbbbbb-2222-0000-0000-00000000000b'''
\set pattern_a '''aaaaaaaa-3333-0000-0000-00000000000a'''
\set pattern_b '''bbbbbbbb-3333-0000-0000-00000000000b'''

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', :user_a, 'authenticated', 'authenticated', 'a@example.test',
   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', :user_b, 'authenticated', 'authenticated', 'b@example.test',
   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

-- profiles は private.handle_new_user() トリガが作る
select is(
  (select count(*) from public.profiles where id in (:user_a, :user_b)),
  2::bigint,
  'auth.users の INSERT で profiles がトリガ作成される'
);

insert into public.tenants (id, owner_id, name) values (:tenant_a, :user_a, 'A店'), (:tenant_b, :user_b, 'B店');
insert into public.patterns (id, tenant_id, name) values (:pattern_a, :tenant_a, '早番'), (:pattern_b, :tenant_b, 'B番');
insert into public.staffs (id, tenant_id, name) values (:staff_a, :tenant_a, 'Aの人'), (:staff_b, :tenant_b, 'Bの人');
insert into public.staff_patterns (tenant_id, staff_id, pattern_id) values (:tenant_b, :staff_b, :pattern_b);

-- ---------------------------------------------------------------------------
-- ユーザー A になりすます
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', 'aaaaaaaa-0000-0000-0000-00000000000a'), true);

select is((select count(*) from public.staffs), 1::bigint, 'A には自テナントの staffs だけ見える');
select is((select name from public.staffs), 'Aの人', '見えているのは A の staffs');
select is((select count(*) from public.staffs where tenant_id = :tenant_b), 0::bigint, 'B の tenant_id で絞っても 0 行');
select is((select count(*) from public.tenants), 1::bigint, 'tenants も自分がオーナーの 1 件だけ');
select is((select count(*) from public.patterns), 1::bigint, 'patterns も自テナントだけ');

select lives_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, '新人')$$, 'aaaaaaaa-1111-0000-0000-00000000000a'),
  '自テナントへの INSERT は通る'
);
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, '侵入')$$, 'bbbbbbbb-1111-0000-0000-00000000000b'),
  '42501',
  null,
  '別テナントの tenant_id での INSERT は RLS 違反'
);
select throws_ok(
  format($$insert into public.shifts (tenant_id, staff_id, pattern_id, date) values (%L, %L, %L, '2026-09-17')$$,
    'aaaaaaaa-1111-0000-0000-00000000000a', 'bbbbbbbb-2222-0000-0000-00000000000b', 'aaaaaaaa-3333-0000-0000-00000000000a'),
  '23503',
  null,
  '自テナント配下に他テナントの staff_id を混ぜると複合 FK 違反'
);

-- UPDATE / DELETE は RLS で対象行が見えないので「エラーにならず 0 行」になる
select lives_ok(
  format($$update public.staffs set name = 'のっとり' where tenant_id = %L$$, 'bbbbbbbb-1111-0000-0000-00000000000b'),
  '別テナントの UPDATE はエラーにならない（対象 0 行）'
);
select lives_ok(
  format($$delete from public.staffs where tenant_id = %L$$, 'bbbbbbbb-1111-0000-0000-00000000000b'),
  '別テナントの DELETE はエラーにならない（対象 0 行）'
);

-- staff_patterns（005 の createPattern / createStaff が書き込む中間テーブル）
select is((select count(*) from public.staff_patterns), 0::bigint, 'B の staff_patterns は見えない');
select lives_ok(
  format($$insert into public.staff_patterns (tenant_id, staff_id, pattern_id) values (%L, %L, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-2222-0000-0000-00000000000a', 'aaaaaaaa-3333-0000-0000-00000000000a'),
  '自テナントの staff × pattern は結び付けられる'
);
select throws_ok(
  format($$insert into public.staff_patterns (tenant_id, staff_id, pattern_id) values (%L, %L, %L)$$,
    'bbbbbbbb-1111-0000-0000-00000000000b', 'bbbbbbbb-2222-0000-0000-00000000000b', 'bbbbbbbb-3333-0000-0000-00000000000b'),
  '42501',
  null,
  '別テナントの staff_patterns は追加できない'
);
select throws_ok(
  format($$insert into public.staff_patterns (tenant_id, staff_id, pattern_id) values (%L, %L, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a', 'bbbbbbbb-2222-0000-0000-00000000000b', 'aaaaaaaa-3333-0000-0000-00000000000a'),
  '23503',
  null,
  '自テナント配下に他テナントの staff を混ぜると複合 FK 違反'
);

-- TRUNCATE は RLS を通らないので、権限の層で止める（003 §3.3）
select throws_ok('truncate public.staffs', '42501', null, 'authenticated に TRUNCATE 権限はない');

-- profiles は自分の 1 行だけ・SELECT のみ
select is((select count(*) from public.profiles), 1::bigint, 'profiles は自分の 1 行だけ');
select is((select id from public.profiles), :user_a::uuid, '見えているのは自分の profile');
select throws_ok('update public.profiles set is_admin = true', '42501', null, 'profiles に UPDATE 権限はない');
select is((select count(*) from public.plan_change_logs), 0::bigint, 'plan_change_logs は自分の行だけ（0 件）');
select throws_ok(
  $$insert into public.plan_change_logs (user_id, staffs_count) values ('aaaaaaaa-0000-0000-0000-00000000000a', 1)$$,
  '42501', null, 'plan_change_logs に INSERT 権限はない'
);

-- ---------------------------------------------------------------------------
-- 未ログイン（anon）: 権限を revoke してあるので SELECT 自体が拒否される
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select set_config('request.jwt.claims', null, true);

select throws_ok('select count(*) from public.tenants', '42501', null, 'anon は tenants を読めない');
select throws_ok('select count(*) from public.staffs', '42501', null, 'anon は staffs を読めない');
select throws_ok('select count(*) from public.profiles', '42501', null, 'anon は profiles を読めない');
select throws_ok('select private.owned_tenant_ids()', '42501', null, 'anon は private スキーマを使えない');

-- ---------------------------------------------------------------------------
-- 後片付け: B の行が A の操作で変わっていないことを postgres として確認
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select name from public.staffs where id = :staff_b),
  'Bの人',
  'A の UPDATE / DELETE は B の行に影響しない'
);

select is(
  (select count(*) from public.staff_patterns where tenant_id = :tenant_b),
  1::bigint,
  'B の staff_patterns は A の操作後も残っている'
);

select * from finish();
rollback;
