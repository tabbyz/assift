-- 課金（019）の DB 側を固定するテスト（npx supabase test db）。
-- 在籍スタッフの上限の門番（無料・トライアル・有料・個別契約・service_role）、人数の履歴（追加・退職・削除・店舗の削除・退会）、
-- start_trial（1 回だけ・申し込み済みは不可・anon 不可）、トライアルの終わりの計算。
-- 同時実行（profiles の for update）は 1 接続では試せないので、手動で確かめる。
begin;
create extension if not exists pgtap with schema extensions;

select plan(40);

-- ---------------------------------------------------------------------------
-- 準備（postgres として実行）
-- ---------------------------------------------------------------------------
\set user_free '''aaaaaaaa-0000-0000-0000-0000000019a1'''
\set user_paid '''aaaaaaaa-0000-0000-0000-0000000019a2'''
\set user_manual '''aaaaaaaa-0000-0000-0000-0000000019a3'''
\set user_bulk '''aaaaaaaa-0000-0000-0000-0000000019a4'''
\set user_gone '''aaaaaaaa-0000-0000-0000-0000000019a5'''
\set t_free '''aaaaaaaa-1919-0000-0000-000000000001'''
\set t_free2 '''aaaaaaaa-1919-0000-0000-000000000002'''
\set t_paid '''aaaaaaaa-1919-0000-0000-000000000003'''
\set t_manual '''aaaaaaaa-1919-0000-0000-000000000004'''
\set t_bulk '''aaaaaaaa-1919-0000-0000-000000000005'''
\set t_gone '''aaaaaaaa-1919-0000-0000-000000000006'''
\set staff_retired '''aaaaaaaa-1919-2222-0000-000000000001'''
\set staff_one '''aaaaaaaa-1919-2222-0000-000000000002'''

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values (:user_free::uuid, 'billing-free@example.test'),
               (:user_paid::uuid, 'billing-paid@example.test'),
               (:user_manual::uuid, 'billing-manual@example.test'),
               (:user_bulk::uuid, 'billing-bulk@example.test'),
               (:user_gone::uuid, 'billing-gone@example.test')) as u(id, email);

insert into public.tenants (id, owner_id, name) values
  (:t_free, :user_free, '無料A'), (:t_free2, :user_free, '無料B'),
  (:t_paid, :user_paid, '有料'), (:t_manual, :user_manual, '個別'),
  (:t_bulk, :user_bulk, 'まとめ'), (:t_gone, :user_gone, '退会');

-- 有料（active）と個別契約（12 人まで）
insert into public.billing_subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
values (:user_paid, 'sub_paid', 'active', now(), now() + interval '1 month');
update public.profiles set max_staffs_count = 12 where id = :user_manual;
-- complete_setup が勤務 0 で先に止まらないように
insert into public.patterns (tenant_id, name) values (:t_bulk, '早番');

-- ---------------------------------------------------------------------------
-- 計算の部品
-- ---------------------------------------------------------------------------
select is(private.staff_limit(:user_free), 10, 'staff_limit: 無料は 10');
select is(private.staff_limit(:user_paid), null::integer, 'staff_limit: 有料は上限なし');
select is(private.staff_limit(:user_manual), 12, 'staff_limit: 個別契約はその値');
select is(
  private.trial_end_from('2026-10-10 12:00+09'),
  '2027-01-01 00:00+09'::timestamptz,
  'trial_end_from: 10/10 に始めると 12/31 まで（終わりは 1/1 0:00 JST）');
select is(
  private.trial_end_from('2026-10-31 23:30+09'),
  '2027-01-01 00:00+09'::timestamptz,
  'trial_end_from: 月末の夜でも同じ月として数える（JST）');
select is(
  private.trial_end_from('2026-10-31 15:30+00'),
  '2027-02-01 00:00+09'::timestamptz,
  'trial_end_from: UTC の 10/31 15:30 は JST の 11/1 なので 1/31 まで');

-- ---------------------------------------------------------------------------
-- 無料: 10 人まで。2 店舗の合計で数える
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_free), true);

select lives_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'A' || g from generate_series(1, 6) g$$, :t_free),
  '無料: 1 店舗目に 6 人');
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'B' || g from generate_series(1, 4) g$$, :t_free2),
  '無料: 2 店舗目に 4 人（合計 10 人）');
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, '11人目')$$, :t_free2),
  'P0001', 'staff_limit_exceeded', '無料: 11 人目は止まる（全店舗の合計で数える）');
select lives_ok(
  format($$insert into public.staffs (id, tenant_id, name, retired_at) values (%L, %L, '退職者', now())$$, :staff_retired, :t_free),
  '無料: 退職済みとして足すのは在籍が増えないので通る');
select throws_ok(
  format($$update public.staffs set retired_at = null where id = %L$$, :staff_retired),
  'P0001', 'staff_limit_exceeded', '無料: 10 人のときに退職者を復帰させると止まる');
select lives_ok(
  format($$update public.staffs set name = '改名' where id = %L$$, :staff_retired),
  '無料: 在籍が増えない更新は止まらない');

-- トライアル
select ok(public.start_trial() > now(), 'start_trial: トライアルの終わりを返す');
select ok(
  (select trial_end > now() + interval '59 days'
          and extract(day from trial_end at time zone 'Asia/Tokyo') = 1
          and (trial_end at time zone 'Asia/Tokyo')::time = '00:00'
     from public.profiles),
  'start_trial: 2 か月後の月末まで（終わりは月初 0:00 JST）');
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, '11人目')$$, :t_free2),
  'トライアル中: 11 人目を足せる');
select throws_ok('select public.start_trial()', 'P0001', 'start_trial: already used', 'start_trial: 2 回目は使えない');

-- ---------------------------------------------------------------------------
-- 人数の履歴（free は上で 1 人ずつ増えた）
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select active_count from public.staff_count_history where user_id = :user_free order by changed_at desc, id desc limit 1),
  11, '履歴: 最後の行がいまの在籍数（11）');
select is(
  (select count(*) from public.staff_count_history where user_id = :user_free and active_count = 10),
  1::bigint, '履歴: 退職者の追加・改名など在籍数が変わらない操作では行が増えない');

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_free), true);
update public.staffs set retired_at = now() where tenant_id = :t_free2 and name = '11人目';
reset role;
select is(
  (select active_count from public.staff_count_history where user_id = :user_free order by changed_at desc, id desc limit 1),
  10, '履歴: 退職で 1 減る');

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_free), true);
delete from public.tenants where id = :t_free2;
reset role;
select is(
  (select active_count from public.staff_count_history where user_id = :user_free order by changed_at desc, id desc limit 1),
  6, '履歴: 店舗を消すと、その店舗の在籍スタッフの分だけ減った数が記録される');
select is(
  (select count(*) from public.staff_count_history where user_id = :user_free and active_count < 6),
  0::bigint, '履歴: 店舗の削除の cascade で、スタッフ 1 人ごとの行はできない');

-- ---------------------------------------------------------------------------
-- 有料・個別契約・まとめて追加・service_role
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_paid), true);
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'P' || g from generate_series(1, 15) g$$, :t_paid),
  '有料（active）: 15 人を足せる');
select throws_ok('select public.start_trial()', 'P0001', 'start_trial: subscribed', 'start_trial: 申し込み済みは使えない');

reset role;
update public.billing_subscriptions set status = 'past_due' where user_id = :user_paid;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_paid), true);
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, 'P16')$$, :t_paid),
  '有料（past_due）: リトライ中は使えるまま');

reset role;
update public.billing_subscriptions set status = 'canceled' where user_id = :user_paid;
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_paid), true);
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, 'P17')$$, :t_paid),
  'P0001', 'staff_limit_exceeded', '解約後（canceled）: 無料に戻り、10 人を超えていれば足せない');
select lives_ok(
  format($$update public.staffs set retired_at = now() where tenant_id = %L and name = 'P1'$$, :t_paid),
  '解約後: 退職は止めない（減らす操作）');

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_manual), true);
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'M' || g from generate_series(1, 12) g$$, :t_manual),
  '個別契約: 12 人まで足せる');
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, 'M13')$$, :t_manual),
  'P0001', 'staff_limit_exceeded', '個別契約: 13 人目は止まる');

select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_bulk), true);
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'X' || g from generate_series(1, 15) g$$, :t_bulk),
  'P0001', 'staff_limit_exceeded', 'まとめて 15 人: 11 行目で止まる');
reset role;
select is((select count(*) from public.staffs where tenant_id = :t_bulk), 0::bigint, 'まとめて 15 人: 1 行も入らない');
select throws_ok(
  format($$select public.complete_setup(%L, array['a','b','c','d','e','f','g','h','i','j','k'])$$, :t_bulk),
  'P0001', 'staff_limit_exceeded', 'complete_setup: 11 人の初期設定も門番が止める（postgres でも request の auth.uid() で判定）');

-- service_role（auth.uid() が null）は止めない（移行スクリプト）
set local role service_role;
select set_config('request.jwt.claims', null, true);
select lives_ok(
  format($$insert into public.staffs (tenant_id, name) select %L, 'S' || g from generate_series(1, 12) g$$, :t_bulk),
  'service_role: 上限を超えても止めない');

-- ---------------------------------------------------------------------------
-- 退会: auth.users の削除が profiles → tenants → staffs と cascade しても失敗しない
-- ---------------------------------------------------------------------------
reset role;
insert into public.staffs (id, tenant_id, name) values (:staff_one, :t_gone, '1人');
select is(
  (select count(*) from public.staff_count_history where user_id = :user_gone),
  1::bigint, '退会の準備: 履歴が 1 行ある');
select lives_ok(format($$delete from auth.users where id = %L$$, :user_gone), '退会: cascade の途中で履歴を書こうとして失敗しない');
select is(
  (select count(*) from public.staff_count_history where user_id = :user_gone),
  0::bigint, '退会: 履歴も消える');

-- ---------------------------------------------------------------------------
-- 他人の行・anon
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_free), true);
select is(
  (select count(*) from public.staff_count_history where user_id <> :user_free),
  0::bigint, 'staff_count_history: 他人の行は見えない');
select is(
  (select count(*) from public.billing_subscriptions),
  0::bigint, 'billing_subscriptions: 他人の行は見えない');

-- 上限に達した他人（user_free は 10 人）の店舗へ足そうとしても、門番ではなく RLS が弾く（店舗の存在とプランを漏らさない）
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_manual), true);
select throws_ok(
  format($$insert into public.staffs (tenant_id, name) values (%L, '他人の店舗')$$, :t_free),
  '42501', null, '他人の店舗へ足す: staff_limit_exceeded ではなく RLS の拒否');

reset role;
-- 同じ Stripe の Customer を 2 人に結び付けない
update public.profiles set stripe_customer_id = 'cus_shared' where id = :user_free;
select throws_ok(
  format($$update public.profiles set stripe_customer_id = 'cus_shared' where id = %L$$, :user_paid),
  '23505', null, 'profiles.stripe_customer_id は一意');

set local role anon;
select set_config('request.jwt.claims', null, true);
select throws_ok('select count(*) from public.staff_count_history', '42501', null, 'anon は staff_count_history を読めない');

select * from finish();
rollback;
