-- スタッフ。v1 の disabled → retired_at、kana / group_id は廃止、available_patterns / default_patterns は中間テーブル化
create table public.staffs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants (id) on delete cascade,
  name            text        not null check (char_length(name) between 1 and 10),
  position        integer     not null default 0,
  retired_at      timestamptz,
  available_wdays smallint[]  not null default '{0,1,2,3,4,5,6}',
  max_work_week   smallint    not null default 5 check (max_work_week between 0 and 7),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- 子テーブルの複合 FK（tenant_id の一致を DB で保証する）の参照先
  unique (id, tenant_id)
);

create index staffs_tenant_position_idx on public.staffs (tenant_id, position);
create index staffs_tenant_active_position_idx on public.staffs (tenant_id, position) where retired_at is null;

alter table public.staffs enable row level security;

-- Supabase の既定権限は新規テーブルに anon / authenticated へ全権限を付ける。
-- TRUNCATE は RLS を通らないので、一度すべて外してから必要な DML だけ付け直す（003 §3.3）
revoke all on public.staffs from anon, authenticated;
grant select, insert, update, delete on public.staffs to authenticated;

create policy staffs_restrict_same_tenant on public.staffs
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy staffs_member_all on public.staffs
  for all to authenticated
  using (true)
  with check (true);

create trigger staffs_set_updated_at
  before update on public.staffs
  for each row execute function private.set_updated_at();
