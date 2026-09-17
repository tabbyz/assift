-- プラン変更履歴（v1 usage_records）。Stripe には月次の請求人数しか残らないため保持する。
-- Phase 1 は UI なし。書き込みはサブスクリプション Phase の Server Action が行う
create table public.plan_change_logs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  staffs_count integer     not null,
  created_at   timestamptz not null default now()
);

create index plan_change_logs_user_created_idx on public.plan_change_logs (user_id, created_at desc);

alter table public.plan_change_logs enable row level security;

revoke all on public.plan_change_logs from anon, authenticated;
grant select on public.plan_change_logs to authenticated;

create policy plan_change_logs_select_own on public.plan_change_logs
  for select to authenticated
  using (user_id = (select auth.uid()));
