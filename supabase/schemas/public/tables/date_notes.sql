-- 日付メモ（v1 events）。シフト表のヘッダに表示する 1 日 1 件のメモ
create table public.date_notes (
  id         uuid        primary key default gen_random_uuid(),
  tenant_id  uuid        not null references public.tenants (id) on delete cascade,
  date       date        not null,
  note       text        not null check (char_length(note) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, date)
);

alter table public.date_notes enable row level security;

revoke all on public.date_notes from anon, authenticated;
grant select, insert, update, delete on public.date_notes to authenticated;

create policy date_notes_restrict_same_tenant on public.date_notes
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy date_notes_member_all on public.date_notes
  for all to authenticated
  using (true)
  with check (true);

create trigger date_notes_set_updated_at
  before update on public.date_notes
  for each row execute function private.set_updated_at();
