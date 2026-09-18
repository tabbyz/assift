-- テナント境界の RLS を固定するテスト（npx supabase test db）。
-- RLS はこのアプリで唯一の認可境界なので、別テナントの行が見えない・書けないことを毎回確認する。
--
-- pgtap はテストのトランザクション内で作り、宣言的スキーマには入れない（本番に持ち込まない）。
begin;
create extension if not exists pgtap with schema extensions;

select plan(68);

-- ---------------------------------------------------------------------------
-- 準備（postgres として実行。RLS はテーブル所有者には適用されない）
-- ---------------------------------------------------------------------------
\set user_a '''aaaaaaaa-0000-0000-0000-00000000000a'''
\set user_b '''bbbbbbbb-0000-0000-0000-00000000000b'''
\set tenant_a '''aaaaaaaa-1111-0000-0000-00000000000a'''
\set tenant_b '''bbbbbbbb-1111-0000-0000-00000000000b'''
\set staff_a '''aaaaaaaa-2222-0000-0000-00000000000a'''
\set staff_a2 '''aaaaaaaa-2222-0000-0000-00000000002a'''
\set staff_b '''bbbbbbbb-2222-0000-0000-00000000000b'''
\set pattern_a '''aaaaaaaa-3333-0000-0000-00000000000a'''
\set pattern_b '''bbbbbbbb-3333-0000-0000-00000000000b'''
-- assign_shift（007 §5.2）用。A の「夜勤 → 明け」のペア
\set pattern_a_night '''aaaaaaaa-3333-0000-0000-00000000001a'''
\set pattern_a_after '''aaaaaaaa-3333-0000-0000-00000000002a'''

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
insert into public.staffs (id, tenant_id, name, position)
values (:staff_a, :tenant_a, 'Aの人', 0), (:staff_a2, :tenant_a, 'Aの人2', 1), (:staff_b, :tenant_b, 'Bの人', 0);
insert into public.staff_patterns (tenant_id, staff_id, pattern_id) values (:tenant_b, :staff_b, :pattern_b);

-- B のシフト表のデータ（A から見えないことを確認するため。007 §5.2）
-- 日付は 2026-10-01。既存の「複合 FK 違反」テストが staff_b の 2026-09-17 に INSERT するので、
-- 同じ日にすると unique (staff_id, date) が先に出て 23503 を隠してしまう
insert into public.shifts (tenant_id, staff_id, pattern_id, date)
values (:tenant_b, :staff_b, :pattern_b, '2026-10-01');
insert into public.required_nums (tenant_id, pattern_id, date, num)
values (:tenant_b, :pattern_b, '2026-09-17', 2);
insert into public.date_notes (tenant_id, date, note)
values (:tenant_b, '2026-09-17', 'B の予定');

-- ---------------------------------------------------------------------------
-- ユーザー A になりすます
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', 'aaaaaaaa-0000-0000-0000-00000000000a'), true);

select is((select count(*) from public.staffs), 2::bigint, 'A には自テナントの staffs だけ見える');
select is((select name from public.staffs where id = :staff_a), 'Aの人', '見えているのは A の staffs');
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

-- シフト表の 3 テーブル（007）。B の行は 1 件も見えない
select is((select count(*) from public.shifts), 0::bigint, 'B の shifts は見えない');
select is((select count(*) from public.required_nums), 0::bigint, 'B の required_nums は見えない');
select is((select count(*) from public.date_notes), 0::bigint, 'B の date_notes は見えない');

-- 007 で初めて書き込むテーブルなので、INSERT 側の境界も固定する
select throws_ok(
  format($$insert into public.required_nums (tenant_id, pattern_id, date, num) values (%L, %L, '2026-09-17', 1)$$,
    'bbbbbbbb-1111-0000-0000-00000000000b', 'bbbbbbbb-3333-0000-0000-00000000000b'),
  '42501',
  null,
  '別テナントの required_nums は追加できない'
);
select throws_ok(
  format($$insert into public.date_notes (tenant_id, date, note) values (%L, '2026-09-18', 'のっとり')$$,
    'bbbbbbbb-1111-0000-0000-00000000000b'),
  '42501',
  null,
  '別テナントの date_notes は追加できない'
);
-- 自テナントの tenant_id に他テナントの pattern を混ぜると複合 FK で落ちる（007 §3.6）。
-- 日付は B の fixture（2026-09-17）と別にする。同じ日だと unique (pattern_id, date) が先に出る
select throws_ok(
  format($$insert into public.required_nums (tenant_id, pattern_id, date, num) values (%L, %L, '2026-11-03', 1)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a', 'bbbbbbbb-3333-0000-0000-00000000000b'),
  '23503',
  null,
  'required_nums に他テナントの pattern を混ぜると複合 FK 違反'
);

-- ---------------------------------------------------------------------------
-- reorder_positions（006 §5.1）: security invoker なので RLS がそのまま効く
-- ---------------------------------------------------------------------------
select lives_ok(
  format($$select public.reorder_positions('staffs', %L, array[%L, %L]::uuid[])$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000002a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  '自テナントの並べ替えは通る'
);
-- 先行テストが同じ tenant に '新人'（position 既定 0）を入れているので、渡した 2 件に絞って見る
select is(
  (select array_agg(name order by position) from public.staffs where id in (:staff_a, :staff_a2)),
  array['Aの人2', 'Aの人'],
  '渡した順で position が 0..n-1 に振り直される'
);
select throws_ok(
  format($$select public.reorder_positions('staffs', %L, array[%L]::uuid[])$$,
    'bbbbbbbb-1111-0000-0000-00000000000b',
    'bbbbbbbb-2222-0000-0000-00000000000b'),
  'P0001',
  'reorder_positions: 0 of 1 rows updated',
  '別テナントの tenant_id / id で呼ぶと件数不一致で例外'
);
select throws_ok(
  format($$select public.reorder_positions('profiles', %L, array[%L]::uuid[])$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'P0001',
  'reorder_positions: unsupported table profiles',
  'ホワイトリスト外のテーブル名は例外'
);

-- 設計の肝: 自テナントの id に他テナントの id を混ぜたとき、通った分もロールバックされる
select throws_ok(
  format($$select public.reorder_positions('staffs', %L, array[%L, %L]::uuid[])$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'bbbbbbbb-2222-0000-0000-00000000000b'),
  'P0001',
  'reorder_positions: 1 of 2 rows updated',
  '自テナント id に他テナント id を混ぜると例外（件数不一致）'
);
-- name の並びで見ると、ロールバックされなかった場合（両方 position=0）と区別できない。
-- position の値そのものを見る: 正常なら {1, 0}、部分更新が残っていれば {0, 0}
select is(
  (select array_agg(position order by name) from public.staffs where id in (:staff_a, :staff_a2)),
  array[1, 0],
  '混在で失敗したあとも自テナントの position は変わっていない（ロールバック）'
);
-- 重複 id は Zod でも弾くが、DB 側だけでも止まることを固定する
select throws_ok(
  format($$select public.reorder_positions('staffs', %L, array[%L, %L]::uuid[])$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'P0001',
  'reorder_positions: 1 of 2 rows updated',
  '重複した id は例外（unnest で 2 回当たるが更新は 1 行）'
);

-- ---------------------------------------------------------------------------
-- assign_shift（007 §3.2 / §5.2）: 1 トランザクションで既存削除 → ペア処理 → 作成
--
-- ペアのパターンは A 自身が作る（pair_pattern_id は複合 FK なので INSERT 後に UPDATE で張る）。
-- ---------------------------------------------------------------------------
insert into public.patterns (id, tenant_id, name)
values (:pattern_a_night, :tenant_a, '夜勤'), (:pattern_a_after, :tenant_a, '明け');
update public.patterns set pair_pattern_id = :pattern_a_after where id = :pattern_a_night;

-- 1. 空のセルにアサインする
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000000a'),
  'assign_shift: 空のセルにアサインできる'
);
select is(
  (select pattern_id from public.shifts where staff_id = :staff_a and date = '2026-09-17'),
  :pattern_a::uuid,
  'assign_shift: 渡したパターンで 1 行できる'
);

-- 2. ペアを持つパターン（夜勤）をセットすると翌日に明けが入る。fixed も引き継ぐ
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', true, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000001a'),
  'assign_shift: ペアを持つパターンをセットできる'
);
select is(
  (select array_agg(p.name order by s.date)
     from public.shifts s join public.patterns p on p.id = s.pattern_id
    where s.staff_id = :staff_a and s.date in ('2026-09-17', '2026-09-18')),
  array['夜勤', '明け'],
  'assign_shift: 翌日にペアのパターンが入る'
);
select is(
  (select bool_and(fixed) from public.shifts
    where staff_id = :staff_a and date in ('2026-09-17', '2026-09-18')),
  true,
  'assign_shift: ペアの fixed も同じ値になる'
);

-- 3. 翌日を手で別のパターンにしてから夜勤を外す → 翌日は残る（v1 からの改善。001 §4.4）
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-18', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000000a'),
  'assign_shift: 翌日を別のパターンで上書きできる'
);
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'assign_shift: p_pattern_id を省くとアサインを外せる'
);
select is(
  (select pattern_id from public.shifts where staff_id = :staff_a and date = '2026-09-18'),
  :pattern_a::uuid,
  'assign_shift: 翌日がペア以外のパターンなら残る'
);
select is(
  (select count(*) from public.shifts where staff_id = :staff_a and date = '2026-09-17'),
  0::bigint,
  'assign_shift: 外した当日は消える'
);

-- 4. 翌日がペアのパターンのまま外す → 翌日も消える（v1 と同じ）
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000001a'),
  'assign_shift: 夜勤を入れ直す（翌日は明けで上書きされる）'
);
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'assign_shift: 夜勤を外す'
);
select is(
  (select count(*) from public.shifts
    where staff_id = :staff_a and date in ('2026-09-17', '2026-09-18')),
  0::bigint,
  'assign_shift: 翌日がペアのパターンなら一緒に消える'
);

-- 4b / 4c. 「空」ではなく別のパターンで置き換える経路（applyAssign.test.ts の 4b / 4c と対応）。
-- ペアの後片付けは非 null の分岐でも同じように働く
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000001a'),
  'assign_shift: 夜勤を入れ直す（4b の準備）'
);
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000000a'),
  'assign_shift: 夜勤を早番で置き換えられる'
);
select is(
  (select array_agg(p.name order by s.date)
     from public.shifts s join public.patterns p on p.id = s.pattern_id
    where s.staff_id = :staff_a and s.date in ('2026-09-17', '2026-09-18')),
  array['早番'],
  'assign_shift: 別のパターンで置き換えても翌日のペアは消える'
);
-- 翌日がペア以外なら残る（置き換えの場合も）
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-18', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000000a'),
  'assign_shift: 翌日に早番を置く（4c の準備）'
);
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'aaaaaaaa-3333-0000-0000-00000000001a'),
  'assign_shift: 当日を夜勤にする（翌日の早番はペアではない）'
);
select is(
  (select array_agg(p.name order by s.date)
     from public.shifts s join public.patterns p on p.id = s.pattern_id
    where s.staff_id = :staff_a and s.date in ('2026-09-17', '2026-09-18')),
  array['夜勤', '明け'],
  'assign_shift: ペアのセットは翌日を上書きする（早番 → 明け）'
);
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'assign_shift: 片付ける（次のテストのため）'
);

-- 5. 何も無いセルを外しても例外にならない
select lives_ok(
  format($$select public.assign_shift(%L, %L, '2026-12-31', false)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a'),
  'assign_shift: 何も無いセルを外しても例外にならない'
);

-- 6 / 7. 他テナントの id は RLS で見えないので not found（存在を漏らさない）
select throws_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'bbbbbbbb-2222-0000-0000-00000000000b',
    'aaaaaaaa-3333-0000-0000-00000000000a'),
  'P0001',
  'assign_shift: staff not found',
  'assign_shift: 他テナントの staff_id は not found'
);
select throws_ok(
  format($$select public.assign_shift(%L, %L, '2026-09-17', false, %L)$$,
    'aaaaaaaa-1111-0000-0000-00000000000a',
    'aaaaaaaa-2222-0000-0000-00000000000a',
    'bbbbbbbb-3333-0000-0000-00000000000b'),
  'P0001',
  'assign_shift: pattern not found',
  'assign_shift: 他テナントの pattern_id は not found'
);
select is(
  (select count(*) from public.shifts where staff_id = :staff_a and date = '2026-09-17'),
  0::bigint,
  'assign_shift: not found で失敗した呼び出しは 1 行も作らない'
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
select throws_ok(
  $$select public.reorder_positions('staffs', 'aaaaaaaa-1111-0000-0000-00000000000a', array['aaaaaaaa-2222-0000-0000-00000000000a']::uuid[])$$,
  '42501', null, 'anon は reorder_positions を実行できない'
);
select throws_ok(
  $$select public.assign_shift('aaaaaaaa-1111-0000-0000-00000000000a', 'aaaaaaaa-2222-0000-0000-00000000000a', '2026-09-17', false)$$,
  '42501', null, 'anon は assign_shift を実行できない'
);

-- Supabase の ALTER DEFAULT PRIVILEGES は新しい public の関数にも anon の EXECUTE を付ける。
-- unmanaged/restrict_anon_grants.sql の追記を忘れた RPC がここで落ちるよう、関数ごとではなく全体を見る
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  '',
  'anon が EXECUTE できる public の関数は 1 つも無い'
);

-- unmanaged/restrict_anon_grants.sql は TABLES と SEQUENCES も revoke している。
-- テーブルを足したときの追記漏れも、名前を並べずにここで捕まえる
-- （RLS があるので読めはしないが、TRUNCATE は RLS を通らないので権限の層で閉じる）
-- `information_schema.role_table_grants` は grantee が PUBLIC の付与を anon の行として出さないが、
-- PUBLIC への付与は anon にも効く。関数・シーケンスと同じく has_*_privilege で見る
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and has_table_privilege(
            'anon', c.oid,
            'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')),
  '',
  'anon が権限を持つ public のテーブルは 1 つも無い'
);
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'S'
      and (has_sequence_privilege('anon', c.oid, 'USAGE')
        or has_sequence_privilege('anon', c.oid, 'SELECT')
        or has_sequence_privilege('anon', c.oid, 'UPDATE'))),
  '',
  'anon が権限を持つ public のシーケンスは 1 つも無い'
);

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
