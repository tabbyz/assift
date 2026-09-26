-- 店舗。テナント境界の根。owner_id が private.owned_tenant_ids() の判定元になる
create table public.tenants (
  id            uuid        primary key default gen_random_uuid(),
  owner_id      uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text        not null check (char_length(name) between 1 and 20),
  shift_cycle   public.shift_cycle not null default 'month',
  start_of_week smallint    not null default 0 check (start_of_week between 0 and 6),
  -- 自動アサインの「AI への指示」の店舗の既定（012 §4.2）。上限は lib/validation/assist.ts と同じ
  assist_notes  text        check (char_length(assist_notes) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index tenants_owner_id_idx on public.tenants (owner_id);

alter table public.tenants enable row level security;

revoke all on public.tenants from anon, authenticated;
grant select, insert, update, delete on public.tenants to authenticated;

create policy tenants_owner_all on public.tenants
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function private.set_updated_at();
