-- アサイン済みのシフト 1 コマ。1 スタッフ 1 日 1 コマ（v1 と同じ）
create table public.shifts (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  staff_id   uuid        not null,
  pattern_id uuid        not null,
  date       date        not null,
  fixed      boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, date),
  foreign key (staff_id, tenant_id)   references public.staffs (id, tenant_id)   on delete cascade,
  foreign key (pattern_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade
);

-- (tenant_id, date) の範囲読みに加え、listShifts のページング順 (date, staff_id) と count をこの索引だけで賄う（008 §10.15）
create index shifts_tenant_date_staff_idx on public.shifts (tenant_id, date, staff_id);
create index shifts_pattern_id_idx on public.shifts (pattern_id);

alter table public.shifts enable row level security;

revoke all on public.shifts from anon, authenticated;
grant select, insert, update, delete on public.shifts to authenticated;

create policy shifts_restrict_same_tenant on public.shifts
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy shifts_member_all on public.shifts
  for all to authenticated
  using (true)
  with check (true);

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function private.set_updated_at();
