-- 勤務パターン。pair_pattern_id は「夜勤 → 明け」のようにアサイン時に翌日へ自動で入るペア
create table public.patterns (
  id                    uuid        primary key default gen_random_uuid(),
  tenant_id             uuid        not null references public.tenants (id) on delete cascade,
  name                  text        not null check (char_length(name) between 1 and 6),
  description           text        check (char_length(description) <= 10),
  color_hex             text        not null default '#FFFFFF' check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  kind                  public.pattern_kind not null default 'workday',
  pair_pattern_id       uuid,
  position              integer     not null default 0,
  default_required_nums jsonb       not null default '{}'::jsonb, -- {"0".."6","holiday": number}
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, tenant_id),
  -- ペアは同一テナント内に限る。削除時は pair_pattern_id だけ null にする（列指定の set null は PG 15+）
  foreign key (pair_pattern_id, tenant_id) references public.patterns (id, tenant_id)
    on delete set null (pair_pattern_id)
);

create index patterns_tenant_position_idx on public.patterns (tenant_id, position);
create index patterns_pair_pattern_id_idx on public.patterns (pair_pattern_id);

alter table public.patterns enable row level security;

revoke all on public.patterns from anon, authenticated;
grant select, insert, update, delete on public.patterns to authenticated;

create policy patterns_restrict_same_tenant on public.patterns
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy patterns_member_all on public.patterns
  for all to authenticated
  using (true)
  with check (true);

create trigger patterns_set_updated_at
  before update on public.patterns
  for each row execute function private.set_updated_at();
