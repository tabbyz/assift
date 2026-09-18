-- 自動アサインの制約。Phase 1 は設定 UI のみ（エンジンは Phase 2）。
-- pattern1_id / pattern2_id は nullable。複合 FK は MATCH SIMPLE なので null の行は検査されない
create table public.restrictions (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  kind        public.restriction_kind not null,
  -- 1..7。001 の素案は 1..31 だったが、それは v1 の `max_work_month`（v2 の enum に無い残骸）を
  -- 想定した値だった。残る 2 種別（max_work_week / max_work_consecutive）は v1 の画面も 1..7 で、
  -- アプリの Zod も 1..7。DB だけ緩いと、範囲外の行が「画面には出るが保存できない」状態を作る（006 §10.12）
  days        smallint    check (days between 1 and 7),
  pattern1_id uuid,
  pattern2_id uuid,
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (pattern1_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade,
  foreign key (pattern2_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade
);

create index restrictions_tenant_position_idx on public.restrictions (tenant_id, position);
create index restrictions_pattern1_id_idx on public.restrictions (pattern1_id);
create index restrictions_pattern2_id_idx on public.restrictions (pattern2_id);

alter table public.restrictions enable row level security;

revoke all on public.restrictions from anon, authenticated;
grant select, insert, update, delete on public.restrictions to authenticated;

create policy restrictions_restrict_same_tenant on public.restrictions
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy restrictions_member_all on public.restrictions
  for all to authenticated
  using (true)
  with check (true);

create trigger restrictions_set_updated_at
  before update on public.restrictions
  for each row execute function private.set_updated_at();
