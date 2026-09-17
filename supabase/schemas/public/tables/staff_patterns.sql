-- スタッフが選択可能な勤務パターン（v1 staffs.available_patterns の YAML を中間テーブル化）
create table public.staff_patterns (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  staff_id   uuid not null,
  pattern_id uuid not null,
  primary key (staff_id, pattern_id),
  foreign key (staff_id, tenant_id)   references public.staffs (id, tenant_id)   on delete cascade,
  foreign key (pattern_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade
);

create index staff_patterns_tenant_id_idx on public.staff_patterns (tenant_id);
create index staff_patterns_pattern_id_idx on public.staff_patterns (pattern_id);

alter table public.staff_patterns enable row level security;

revoke all on public.staff_patterns from anon, authenticated;
grant select, insert, update, delete on public.staff_patterns to authenticated;

create policy staff_patterns_restrict_same_tenant on public.staff_patterns
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy staff_patterns_member_all on public.staff_patterns
  for all to authenticated
  using (true)
  with check (true);
