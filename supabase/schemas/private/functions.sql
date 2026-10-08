-- ログインユーザーがオーナーのテナント id。
-- ポリシーからは `tenant_id in (select private.owned_tenant_ids())` の形で使う。
-- 引数なしの集合関数にすることで、プランナが文ごとに 1 回だけ評価して Hash Join する
-- （行の列を引数に取ると SubPlan として行ごとに評価される。003 §3.2）。
-- security definer で tenants の RLS を通さずに読む（tenants 自身のポリシーとの再帰を避ける）。
create or replace function private.owned_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.tenants t where t.owner_id = (select auth.uid());
$$;

-- EXECUTE は既定で PUBLIC に付くため、anon だけを revoke しても効かない。PUBLIC から外して付け直す
revoke execute on function private.owned_tenant_ids() from public;
grant execute on function private.owned_tenant_ids() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 一度入った tenants.setup_completed_at は変えられない（014 §5.1）。
-- 取り消すと店舗が「準備中」に戻り、初期設定の画面に連れて行かれる。
-- RPC は security invoker なので列の GRANT では絞れず、トリガで守る。service_role にも効くので、
-- 運用でデータを直すときは、その migration の中でこのトリガを一時的に外して戻す。
create or replace function private.guard_setup_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.setup_completed_at is not null
     and new.setup_completed_at is distinct from old.setup_completed_at then
    raise exception 'setup_completed_at is immutable';
  end if;
  return new;
end;
$$;

-- auth.users INSERT → profiles 作成。
-- 移行スクリプトが先に profiles を作っていても失敗しないよう on conflict do nothing にする
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- auth.users.email 更新 → profiles.email 同期
create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 課金（019）: 在籍スタッフの上限と、人数の履歴
-- ---------------------------------------------------------------------------

-- 利用者（店舗のオーナー）の全店舗の在籍スタッフ数
create or replace function private.active_staff_count(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from public.staffs s
    join public.tenants t on t.id = s.tenant_id
   where t.owner_id = p_owner
     and s.retired_at is null;
$$;

-- 在籍スタッフの上限（019 §5.1）。null = 上限なし。lib/billing/entitlement.ts と同じ規則（上から順に）:
--   1. サブスクリプションが active / trialing / past_due → なし
--   2. トライアル中（trial_end > now()）→ なし
--   3. 個別契約（max_staffs_count > 10）→ その値
--   4. それ以外 → 10（FREE_STAFF_LIMIT）
create or replace function private.staff_limit(p_owner uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.billing_subscriptions b
       where b.user_id = p_owner and b.status in ('active', 'trialing', 'past_due')
    ) then null
    when exists (
      select 1 from public.profiles p where p.id = p_owner and p.trial_end > now()
    ) then null
    else greatest(10, coalesce((select p.max_staffs_count from public.profiles p where p.id = p_owner), 10))
  end;
$$;

-- 在籍が 1 人増える変更（追加・復帰）を、上限を超えるなら止める（019 §5.3）。
-- Action ごとに確かめると抜ける（PostgREST の INSERT・UPDATE・初期設定の RPC）ので DB で止める。
-- 移行スクリプト・service_role（auth.uid() が null）は止めない
create or replace function private.guard_staff_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_limit integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- 在籍が増えない変更は見ない（退職のまま足す・在籍のまま更新する）
  if new.retired_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.retired_at is null then
    return new;
  end if;

  select t.owner_id into v_owner from public.tenants t where t.id = new.tenant_id;
  if v_owner is null then
    return new;
  end if;

  -- 同時に 2 件足されて上限を超えないよう、利用者の単位で直列にする
  perform 1 from public.profiles p where p.id = v_owner for update;

  v_limit := private.staff_limit(v_owner);
  -- 行トリガは同じ文で先に処理した行を見るので、複数行の INSERT でも上限の行で止まる
  if v_limit is not null and private.active_staff_count(v_owner) + 1 > v_limit then
    raise exception 'staff_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- 在籍数を数えて履歴に 1 行足す。前の行と同じ数なら足さない。利用者が既にいない（退会の cascade の途中）なら何もしない。
-- p_excluded_tenant は削除中の店舗（その在籍スタッフを数えない。BEFORE DELETE ではまだ行が残っているため）。
--
-- 数える前に利用者の行をロックする（門番 guard_staff_limit と同じロック）。ロックせずに数えると、同じ利用者の退職・削除が
-- 同時に走ったとき互いにコミット前の変更を見ないまま数え、最後の行が実際より多いまま残る（次の期間の「開始時点の人数」が
-- 多く請求される）。plpgsql は文ごとにスナップショットを取り直すので、ロックを待った後の数には先にコミットした側の変更が入る
create or replace function private.record_owner_staff_count(p_owner uuid, p_excluded_tenant uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  perform 1 from public.profiles p where p.id = p_owner for update;
  if not found then
    return;
  end if;
  v_count := private.active_staff_count(p_owner)
    - (select count(*)::integer from public.staffs s
        where p_excluded_tenant is not null and s.tenant_id = p_excluded_tenant and s.retired_at is null);
  if v_count is not distinct from (
    select h.active_count from public.staff_count_history h
     where h.user_id = p_owner
     order by h.changed_at desc, h.id desc
     limit 1
  ) then
    return;
  end if;
  insert into public.staff_count_history (user_id, active_count) values (p_owner, v_count);
end;
$$;

-- スタッフの追加・退職・復帰・削除で在籍数を記録する（AFTER）。
-- 店舗の削除の cascade で消えるときは店舗の行がもう無いので何もしない（private.record_tenant_delete が記録する）
create or replace function private.record_staff_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select t.owner_id into v_owner
    from public.tenants t
   where t.id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  if v_owner is null then
    return null;
  end if;
  perform private.record_owner_staff_count(v_owner);
  return null;
end;
$$;

-- 店舗の削除（BEFORE）。この店舗の在籍スタッフを除いた数を記録する。
-- 記録しないと減少が残らず、次の期間の「開始時点の人数」が多いまま請求される（019 §5.3）
create or replace function private.record_tenant_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.record_owner_staff_count(old.owner_id, old.id);
  return old;
end;
$$;

-- トライアルの終わり（019 §7）: 始めた日（JST）から 2 か月後の月末まで。返すのはその次の瞬間（翌月 1 日 0:00 JST）。
-- lib/billing/trial.ts と同じ計算
create or replace function private.trial_end_from(p_now timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('month', p_now at time zone 'Asia/Tokyo') + interval '3 months') at time zone 'Asia/Tokyo';
$$;

revoke execute on function private.active_staff_count(uuid) from public;
revoke execute on function private.staff_limit(uuid) from public;
revoke execute on function private.record_owner_staff_count(uuid, uuid) from public;
revoke execute on function private.trial_end_from(timestamptz) from public;
