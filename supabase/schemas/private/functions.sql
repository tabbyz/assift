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
