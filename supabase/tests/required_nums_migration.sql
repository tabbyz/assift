-- 015 の移行（焼き付けた必要人数の行を消す）を固定するテスト（npx supabase test db）。
--
-- `db reset` は migrations → seed の順で流れるので、**移行そのものは seed の行に効かない**。
-- そこでここでテスト用の行を入れ、`migrations/20261005150000_resolve_required_nums.sql` と
-- 同じ DELETE を流して確かめる（SQL は migration からの写し。片方を直したらもう片方も直す）。
begin;
create extension if not exists pgtap with schema extensions;

select plan(7);

\set user_a '''aaaaaaaa-0000-0000-0000-0000000015aa'''
\set tenant_a '''aaaaaaaa-1515-0000-0000-000000000001'''
-- 曜日ごとに違う基本の人数（日 3 / 月 2 / 祝 5）
\set p_days '''aaaaaaaa-1515-4444-0000-000000000001'''
-- 基本が空（未設定）の勤務
\set p_empty '''aaaaaaaa-1515-4444-0000-000000000002'''

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', :user_a, 'authenticated', 'authenticated', 'migration-a@example.test',
   '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

insert into public.tenants (id, owner_id, name) values (:tenant_a, :user_a, '移行テスト');

insert into public.patterns (id, tenant_id, name, kind, default_required_nums, position)
values
  (:p_days, :tenant_a, '早番', 'workday', '{"0": 3, "1": 2, "holiday": 5}'::jsonb, 1),
  (:p_empty, :tenant_a, '通し', 'workday', '{}'::jsonb, 2);

-- 2026-10-11 は日曜、10-12 は月曜（祝日。焼き付けは holiday の 5 を入れていた）、10-13 は火曜（基本なし）
insert into public.required_nums (tenant_id, pattern_id, date, num)
values
  -- 消える: 日曜の基本（3）と同じ
  (:tenant_a, :p_days, '2026-10-11', 3),
  -- 残る: 月曜の基本（2）と違う = 手で変えた日
  (:tenant_a, :p_days, '2026-10-12', 5),
  -- 残る: 火曜の基本は無い（0 扱い）が、値が 1 なので上書き
  (:tenant_a, :p_days, '2026-10-13', 1),
  -- 消える: 基本が無い勤務の 0（焼き付けの残骸）
  (:tenant_a, :p_empty, '2026-10-11', 0),
  -- 残る: 基本が無い勤務の 1（手で入れた）
  (:tenant_a, :p_empty, '2026-10-12', 1);

select is(
  (select count(*)::int from public.required_nums where tenant_id = :tenant_a),
  5,
  '移行の前は 5 行'
);

-- ---------------------------------------------------------------------------
-- migration と同じ DELETE
-- ---------------------------------------------------------------------------
delete from public.required_nums rn
using public.patterns p
where rn.pattern_id = p.id
  and rn.num = coalesce(
    (p.default_required_nums ->> extract(dow from rn.date)::int::text)::int,
    0
  );

select is(
  (select count(*)::int from public.required_nums where tenant_id = :tenant_a),
  3,
  '基本と同じ値の行だけが消える'
);

select ok(
  not exists (select 1 from public.required_nums where pattern_id = :p_days and date = '2026-10-11'),
  '日曜の基本（3）と同じ行は消える'
);

select is(
  (select num::int from public.required_nums where pattern_id = :p_days and date = '2026-10-12'),
  5,
  '手で変えた日（月曜に 5）は残る'
);

select is(
  (select num::int from public.required_nums where pattern_id = :p_days and date = '2026-10-13'),
  1,
  '基本が無い曜日の 1 は上書きとして残る'
);

select ok(
  not exists (select 1 from public.required_nums where pattern_id = :p_empty and date = '2026-10-11'),
  '基本が無い勤務の 0（焼き付けの残骸）は消える'
);

select is(
  (select num::int from public.required_nums where pattern_id = :p_empty and date = '2026-10-12'),
  1,
  '基本が無い勤務の 1 は残る'
);

select * from finish();
rollback;
