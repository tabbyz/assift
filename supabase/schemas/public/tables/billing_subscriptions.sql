-- Stripe の Subscription の写し（019 §5.2）。1 人 1 件。正は Stripe で、同期関数（service_role）だけが書く。
-- 在籍スタッフの上限（private.staff_limit）と画面が読む
create table public.billing_subscriptions (
  user_id                uuid        primary key references public.profiles (id) on delete cascade,
  stripe_subscription_id text        not null unique,
  -- Stripe の status をそのまま（active / trialing / past_due / canceled / unpaid / incomplete ...）
  status                 text        not null,
  -- assift_monthly。lookup_key の無い v1 の price（freemium-monthly）は price の id
  price_lookup_key       text,
  -- 旧料金のクーポン（50）。null = なし。切り替え待ち（has_schedule）の間は schedule の次の phase の割引
  discount_percent       smallint,
  -- 解約予定（期間の終わり）
  cancel_at              timestamptz,
  current_period_start   timestamptz not null,
  current_period_end     timestamptz not null,
  -- v1 からの切り替え待ち（schedule 付き。ポータルで解約できない。019 §8.2）
  has_schedule           boolean     not null default false,
  synced_at              timestamptz not null default now()
);

alter table public.billing_subscriptions enable row level security;

revoke all on public.billing_subscriptions from anon, authenticated;
grant select on public.billing_subscriptions to authenticated;

create policy billing_subscriptions_select_own on public.billing_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));
