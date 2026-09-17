-- auth.users に 1:1 で対応するアプリ側のユーザー。認可ロール（is_admin）はここを信頼する。
-- Stripe 関連列は v1 から移行するだけで Phase 1 では使わない。
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text,
  is_admin               boolean     not null default false,
  stripe_customer_id     text,
  stripe_subscription_id text,
  trial_end              timestamptz,
  max_staffs_count       integer,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Phase 1 にユーザーが更新する列はない（email はトリガ同期、is_admin は SQL で立てる）。
-- 編集可能な列が増えたときに grant update (col) を足す（003 §3.5）
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
