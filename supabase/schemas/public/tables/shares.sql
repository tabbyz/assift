-- URL 共有。/share/[code] は未ログインで開くため、読み取りは createPrivilegedClient() で行う（anon ポリシーは作らない）
create table public.shares (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  code       text        not null unique check (code ~ '^[A-Za-z0-9]{8}$'),
  start_date date        not null,
  end_date   date        not null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 31)
);

create index shares_tenant_created_idx on public.shares (tenant_id, created_at desc);

alter table public.shares enable row level security;

revoke all on public.shares from anon, authenticated;
grant select, insert, update, delete on public.shares to authenticated;

create policy shares_restrict_same_tenant on public.shares
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy shares_member_all on public.shares
  for all to authenticated
  using (true)
  with check (true);
