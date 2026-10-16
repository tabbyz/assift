-- 中止のときの片付け（026 §14）。COMMIT したインポートを、インポートの前の状態（管理用アカウント 1 人・店舗 0 件）に戻す。
--
--   # 確認だけ（最後に ROLLBACK）
--   psql '<DB>' -X -v ON_ERROR_STOP=1 -v expected_users=<N> -f scripts/migrate-v1/undo.sql
--   # 反映（COMMIT）
--   psql '<DB>' -X -v ON_ERROR_STOP=1 -v expected_users=<N> -v commit=1 -f scripts/migrate-v1/undo.sql
--
-- - <DB> はインポートの MIGRATION_DATABASE_URL と同じ値
-- - <N> はインポートが入れた人数: jq '.after["auth.users"] - .before["auth.users"]' <dir>/report.json
-- - 使えるのは判断点 B（Stripe の契約を書き換える）の前だけ（026 §14.1）。B の前かは人が確かめる。G2 が止めるのは写しが入った後だけ
-- - 店舗配下は TRUNCATE で空にする（行数によらず速く、ディスクもすぐ空き、削除のトリガも走らない。026 §14.2-1）。
--   残りは管理用以外の auth.users の DELETE の cascade（auth.identities・auth.sessions など / profiles → billing_subscriptions・staff_count_history）
-- - 1 トランザクション。安全装置か確かめが外れたら例外で全体が戻り、psql は 0 以外で終わる

\set ON_ERROR_STOP on

\if :{?expected_users}
\else
  do $$ begin raise exception 'expected_users がありません。-v expected_users=<N> で渡してください（026 §14.3）'; end $$;
\endif
\if :{?commit}
\else
  \set commit off
\endif

\timing on

-- ディスクが 95% を超えると Supabase は default_transaction_read_only を on にする。そのときも流せるよう明示する
begin read write;
set local statement_timeout = 0;
set local lock_timeout = '10s';

-- psql の変数は $$ の中で置き換わらないので、トランザクションの中だけの設定に入れて DO から読む
select set_config('undo.expected_users', :'expected_users', true) as expected_users;

-- 安全装置（1 つでも外れたら何も消さない）
do $$
declare
  v_expected integer := current_setting('undo.expected_users')::integer;
  v_admins integer;
  v_admin uuid;
  v_users integer;
begin
  -- G0: RLS を迂回できるロールか。できないロールでは auth.users と public の表の DELETE が例外にならず 0 行になる
  if not (select r.rolbypassrls or r.rolsuper from pg_roles r where r.rolname = current_user) then
    raise exception 'G0: % は RLS を迂回できません（BYPASSRLS が要る）', current_user;
  end if;

  -- G1: 管理者がちょうど 1 人
  select count(*)::integer into v_admins from public.profiles where is_admin;
  if v_admins <> 1 then
    raise exception 'G1: is_admin の人が % 人です（1 人のはず）', v_admins;
  end if;
  select id into v_admin from public.profiles where is_admin;

  -- G2: Stripe の写しが無い（公開の後・写しが入った後に流すのを止める）
  if exists (select 1 from public.billing_subscriptions) then
    raise exception 'G2: billing_subscriptions に行があります。判断点 B の後か、Webhook の無効化が漏れています（026 §14.4「通らなかったとき」）';
  end if;

  -- G3: 管理用アカウントが店舗を持たない
  if exists (select 1 from public.tenants where owner_id = v_admin) then
    raise exception 'G3: 管理用アカウントが店舗を持っています';
  end if;

  -- G4: 消す人数がインポートの入れた人数と同じ
  select count(*)::integer into v_users from auth.users where id <> v_admin;
  if v_users <> v_expected then
    raise exception 'G4: 管理用以外の auth.users が % 人です（expected_users = %）', v_users, v_expected;
  end if;

  perform set_config('undo.admin_id', v_admin::text, true);
  raise notice '安全装置を通りました: 管理用 % / 消す人 % 人', v_admin, v_users;
end
$$;

-- 店舗配下（tenants を参照する 10 表も外部キーで連鎖して空になる）
truncate table public.tenants cascade;

-- 管理用以外の利用者（auth.* と profiles 以下は cascade）
delete from auth.users where id <> current_setting('undo.admin_id')::uuid;

-- 確かめ（外れたら全体が戻る）
do $$
declare
  v_admin uuid := current_setting('undo.admin_id')::uuid;
  v_table text;
  v_found boolean;
begin
  if (select count(*) from auth.users) <> 1 or not exists (select 1 from auth.users where id = v_admin) then
    raise exception '確かめ: auth.users が管理用の 1 行ではありません';
  end if;
  if (select count(*) from public.profiles) <> 1 then
    raise exception '確かめ: profiles が 1 行ではありません';
  end if;
  foreach v_table in array array[
    'public.tenants', 'public.staffs', 'public.patterns', 'public.staff_patterns', 'public.staff_default_patterns',
    'public.shifts', 'public.required_nums', 'public.restrictions', 'public.date_notes', 'public.shares',
    'public.assist_runs', 'public.billing_subscriptions'
  ] loop
    execute format('select exists (select 1 from %s)', v_table) into v_found;
    if v_found then
      raise exception '確かめ: % が空ではありません', v_table;
    end if;
  end loop;
  if exists (select 1 from public.staff_count_history where user_id <> v_admin) then
    raise exception '確かめ: 管理用以外の staff_count_history が残っています';
  end if;
  if exists (select 1 from auth.identities where user_id <> v_admin) then
    raise exception '確かめ: 管理用以外の auth.identities が残っています';
  end if;
end
$$;

-- report.json の before と同じ 14 表（管理用アカウントの分だけが残る）
select "table", count from (
  select 1 as n, 'auth.users' as "table", count(*) as count from auth.users
  union all select 2, 'auth.identities', count(*) from auth.identities
  union all select 3, 'public.profiles', count(*) from public.profiles
  union all select 4, 'public.tenants', count(*) from public.tenants
  union all select 5, 'public.patterns', count(*) from public.patterns
  union all select 6, 'public.staffs', count(*) from public.staffs
  union all select 7, 'public.staff_patterns', count(*) from public.staff_patterns
  union all select 8, 'public.staff_default_patterns', count(*) from public.staff_default_patterns
  union all select 9, 'public.shifts', count(*) from public.shifts
  union all select 10, 'public.required_nums', count(*) from public.required_nums
  union all select 11, 'public.restrictions', count(*) from public.restrictions
  union all select 12, 'public.date_notes', count(*) from public.date_notes
  union all select 13, 'public.shares', count(*) from public.shares
  union all select 14, 'public.staff_count_history', count(*) from public.staff_count_history
) c order by n;

\if :commit
  commit;
  \echo 'COMMIT しました。Webhook と Cron は、別の接続で profiles が 1 行なのを確かめてから戻す（026 §14.4）'
\else
  rollback;
  \echo '確認だけ: ROLLBACK しました（反映するには -v commit=1）'
\endif
