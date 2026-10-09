-- 運営者の管理画面のユーザー一覧（020 §6.1）の RPC を固定するテスト（npx supabase test db）。
-- 呼べるのは service_role だけ・検索・ページ送りと総数・店舗数と在籍数・登録方法・契約の状態。
-- seed のユーザー（dev / admin）と混ざらないよう、検索語 'admlist-' で絞って数える。
begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- 準備（postgres として実行）
-- ---------------------------------------------------------------------------
\set user_a '''aaaaaaaa-0000-0000-0000-0000000020a1'''
\set user_b '''aaaaaaaa-0000-0000-0000-0000000020a2'''
\set user_c '''aaaaaaaa-0000-0000-0000-0000000020a3'''
\set t_a1 '''aaaaaaaa-2020-0000-0000-000000000001'''
\set t_a2 '''aaaaaaaa-2020-0000-0000-000000000002'''

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
  from (values (:user_a::uuid, 'admlist-a@example.test'),
               (:user_b::uuid, 'admlist-b@example.test'),
               (:user_c::uuid, 'admlist-c@example.test')) as u(id, email);

-- 登録順（新しい順に並ぶことを確かめる。トリガは同じ now() を入れるので書き換える）
update public.profiles set created_at = now() - interval '3 days' where id = :user_a;
update public.profiles set created_at = now() - interval '2 days' where id = :user_b;
update public.profiles set created_at = now() - interval '1 day' where id = :user_c;

-- A: 店舗 2 つ・在籍 3 人・退職 1 人・メールで登録
insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at)
values (gen_random_uuid(), :user_a, :user_a, 'email', '{}', now(), now());
insert into public.tenants (id, owner_id, name) values (:t_a1, :user_a, '一号店'), (:t_a2, :user_a, '二号店');
insert into public.staffs (tenant_id, name) values (:t_a1, '甲'), (:t_a1, '乙'), (:t_a2, '丙');
insert into public.staffs (tenant_id, name, retired_at) values (:t_a2, '丁', now());

-- B: 有料プラン
insert into public.billing_subscriptions (user_id, stripe_subscription_id, status, current_period_start, current_period_end)
values (:user_b, 'sub_admlist', 'active', now(), now() + interval '1 month');

-- ---------------------------------------------------------------------------
-- 権限
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.admin_list_users(text, integer, integer)', 'EXECUTE'),
  'authenticated は EXECUTE を持たない'
);

set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', :user_a), true);
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'authenticated は呼べない');
reset role;

set local role anon;
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'anon は呼べない');
reset role;

-- ---------------------------------------------------------------------------
-- service_role
-- ---------------------------------------------------------------------------
set local role service_role;

select is(
  (select array_agg(email order by ord) from (
     select email, row_number() over () as ord from public.admin_list_users('admlist-')) t),
  array['admlist-c@example.test', 'admlist-b@example.test', 'admlist-a@example.test'],
  '検索語で絞り、登録の新しい順に並ぶ'
);
select is(
  (select count(*) from public.admin_list_users('ADMLIST-A')), 1::bigint,
  '検索は大文字小文字を区別しない'
);
select is(
  (select count(*) from public.admin_list_users('admlist-', 2, 0)), 2::bigint,
  'p_limit で 1 ページの件数を絞る'
);
select is(
  (select distinct total_count from public.admin_list_users('admlist-', 2, 0)), 3::bigint,
  '総数はページの件数ではなく、絞り込んだ件数'
);
select is(
  (select email from public.admin_list_users('admlist-', 2, 2)), 'admlist-a@example.test',
  'p_offset で次のページ'
);
select is(
  (select count(*) from public.admin_list_users('admlist-', 50, 10)), 0::bigint,
  '範囲外のページは 0 行'
);
select is(
  (select count(*) from public.admin_list_users('admlist-', 1000, 0)), 3::bigint,
  'p_limit は 100 までに丸める（3 件なので全部返る）'
);

select is(
  (select row(tenant_count, active_staff_count) from public.admin_list_users('admlist-a')),
  row(2, 3),
  '店舗数と在籍数（退職は数えない）'
);
select is(
  (select providers from public.admin_list_users('admlist-a')), array['email'],
  '登録方法は auth.identities の provider'
);
select is(
  (select providers from public.admin_list_users('admlist-c')), '{}'::text[],
  'identity が無ければ空の配列'
);
select is(
  (select subscription_status from public.admin_list_users('admlist-b')), 'active',
  '契約の状態は billing_subscriptions の写し'
);

reset role;

select * from finish();
rollback;
