-- auth.users に 1:1 で対応するアプリ側のユーザー。認可ロール（is_admin）はここを信頼する。
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text,
  is_admin           boolean     not null default false,
  -- Stripe の Customer（019）。利用者が書ける口を作らない（他人の Customer を指すとポータルで他人の請求が見える）。
  -- 書くのは startCheckout()（service_role）と v1 からの移行だけ
  stripe_customer_id text,
  -- トライアルの終わり（019 §7。この時刻を過ぎたら終わり）。null = 一度も使っていない。
  -- 書くのは public.start_trial() と、申し込みでトライアルを使ったとみなす同期関数（service_role）
  trial_end          timestamptz,
  -- 個別契約（振込）の在籍スタッフの上限。null = 通常（019 §5.1）。管理者が SQL で設定する
  max_staffs_count   integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ユーザーが更新する列はない（email はトリガ同期、is_admin・max_staffs_count は SQL で立てる、
-- trial_end は start_trial()、stripe_customer_id はサーバーだけ）。UPDATE を付けると trial_end などを書き換えられる
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();
