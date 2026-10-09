-- 店舗。テナント境界の根。owner_id が private.owned_tenant_ids() の判定元になる
create table public.tenants (
  id            uuid        primary key default gen_random_uuid(),
  owner_id      uuid        not null default auth.uid() references public.profiles (id) on delete cascade,
  name          text        not null check (char_length(name) between 1 and 20),
  shift_cycle   public.shift_cycle not null default 'month',
  start_of_week smallint    not null default 0 check (start_of_week between 0 and 6),
  -- 自動アサインの「AI への指示」の店舗の既定（012 §4.2）。上限は lib/validation/assist.ts と同じ
  assist_notes  text        check (char_length(assist_notes) <= 500),
  -- 初期設定（014）を終えた日時。null = 準備中。一度入れたら変えない（private.guard_setup_completed_at）
  setup_completed_at timestamptz,
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

create trigger tenants_guard_setup_completed_at
  before update on public.tenants
  for each row execute function private.guard_setup_completed_at();

-- 課金（019 §5.3）: 店舗の削除で在籍数の減少を記録する（スタッフの cascade 側では店舗を引けない）
create trigger tenants_record_tenant_delete
  before delete on public.tenants
  for each row execute function private.record_tenant_delete();
