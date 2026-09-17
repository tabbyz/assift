-- 日付ごとの必要人数（パターン単位）。既定値は patterns.default_required_nums、上書き分をここに持つ
create table public.required_nums (
  id         uuid     primary key default gen_random_uuid(),
  tenant_id  uuid     not null references public.tenants (id) on delete cascade,
  pattern_id uuid     not null,
  date       date     not null,
  num        smallint not null default 0 check (num >= 0),
  unique (pattern_id, date),
  foreign key (pattern_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade
);

create index required_nums_tenant_date_idx on public.required_nums (tenant_id, date);

alter table public.required_nums enable row level security;

revoke all on public.required_nums from anon, authenticated;
grant select, insert, update, delete on public.required_nums to authenticated;

create policy required_nums_restrict_same_tenant on public.required_nums
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy required_nums_member_all on public.required_nums
  for all to authenticated
  using (true)
  with check (true);
