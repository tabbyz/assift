-- 在籍スタッフ数（全店舗の合計）の履歴（019 §4.2）。期間の最大人数をここから計算して Stripe の Meter に送る。
-- 書くのはトリガ（private.record_staff_count / private.record_tenant_delete）だけ
create table public.staff_count_history (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  active_count integer     not null check (active_count >= 0),
  changed_at   timestamptz not null default clock_timestamp()
);

create index staff_count_history_user_changed_idx on public.staff_count_history (user_id, changed_at);

alter table public.staff_count_history enable row level security;

revoke all on public.staff_count_history from anon, authenticated;
grant select on public.staff_count_history to authenticated;

create policy staff_count_history_select_own on public.staff_count_history
  for select to authenticated
  using (user_id = (select auth.uid()));
