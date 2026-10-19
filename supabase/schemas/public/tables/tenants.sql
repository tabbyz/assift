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
  -- 店舗の業種（034）。初期設定のステップ 2 で選んだものが入り、店舗情報の画面で直せる。テンプレートを選ぶことと、店舗の分析に使う。
  -- null = 未回答（初期設定で業種を選んでいない店舗・店舗情報の画面で外した店舗）。
  -- 値は lib/setup/templates.ts の INDUSTRIES と同じ（templates.test.ts がこのファイルを読んで確かめる）
  industry      text check (industry in ('food', 'retail', 'beauty', 'care', 'clinic', 'nursery', 'logistics', 'office', 'other')),
  -- 業種が「その他」のときの任意の一言（034）。上限は lib/validation/tenants.ts の INDUSTRY_NOTE_MAX_LENGTH と同じ
  industry_note text check (char_length(industry_note) between 1 and 20),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 一言は「その他」のときだけ。`industry = 'other'` だと業種が null のとき null になり、CHECK を通ってしまう
  constraint tenants_industry_note_other_only check (industry_note is null or industry is not distinct from 'other')
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
