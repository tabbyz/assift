-- 自動アサインの実行 1 回（012 §5.8）。v1 の assist_token の後継で、shifts.assist_run_id が指す。
-- 期間の上限は表示期間（dateRange は最長 31 日 = 差 30 日）と同じ。
-- request / result / usage は評価・再表示用の jsonb（アプリ層の Zod で型を付け直す）。request はスタッフ名を含む
create table public.assist_runs (
  id              uuid        primary key default gen_random_uuid(),
  tenant_id       uuid        not null references public.tenants (id) on delete cascade,
  start_date      date        not null,
  end_date        date        not null,
  status          public.assist_run_status not null default 'running',
  instructions    text        check (char_length(instructions) <= 500),
  models          jsonb,
  request         jsonb,
  result          jsonb,
  usage           jsonb,
  error           text,
  -- 結果モーダルを閉じた（表の点を消す。012 §3.8）
  acknowledged_at timestamptz,
  rolled_back_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- shifts の複合 FK (assist_run_id, tenant_id) の参照先
  unique (id, tenant_id),
  check (end_date >= start_date and end_date - start_date < 31)
);

create index assist_runs_tenant_created_idx on public.assist_runs (tenant_id, created_at desc);
-- 同じ店舗で 2 つ同時に走らせない。INSERT の 23505 を「実行中の自動アサインがあります」に写す（012 §5.7）
create unique index assist_runs_one_running_idx on public.assist_runs (tenant_id) where status = 'running';

alter table public.assist_runs enable row level security;

-- 行を消す操作は無い（履歴と 1 日の上限の数え方が行に依存する）。DELETE は付けない
revoke all on public.assist_runs from anon, authenticated;
grant select, insert, update on public.assist_runs to authenticated;

create policy assist_runs_restrict_same_tenant on public.assist_runs
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy assist_runs_member_all on public.assist_runs
  for all to authenticated
  using (true)
  with check (true);

-- 打ち切られた running の判定（updated_at < now() − 10 分。012 §5.7）が updated_at を見る
create trigger assist_runs_set_updated_at
  before update on public.assist_runs
  for each row execute function private.set_updated_at();
