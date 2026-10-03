-- 自動アサインの制約（006 の設定 UI、012 のエンジン）。
-- pattern1_id / pattern2_id / staff_id は nullable。複合 FK は MATCH SIMPLE なので null の行は検査されない
-- staff_id が null の行は店舗全体、値があればそのスタッフだけに効く（013 §3.2）
create table public.restrictions (
  id          uuid        primary key default gen_random_uuid(),
  tenant_id   uuid        not null references public.tenants (id) on delete cascade,
  kind        public.restriction_kind not null,
  -- 1..7（土日祝の上限だけ 1..15。下の CHECK）。001 の素案は 1..31 だったが、それは v1 の `max_work_month`
  -- （v2 の enum に無い残骸）を想定した値だった。週の種別は v1 の画面も 1..7 で、アプリの Zod も同じ。
  -- DB だけ緩いと、範囲外の行が「画面には出るが保存できない」状態を作る（006 §10.12）
  days        smallint,
  pattern1_id uuid,
  pattern2_id uuid,
  -- null = 店舗全体。スタッフを消すと規則も消える（退職では消さない。013 §3.8）
  staff_id    uuid,
  -- 必須 = true / なるべく = false。既存の行と v1 から移す行は必須（012 §3.9 の挙動のまま）
  hard        boolean     not null default true,
  -- prefer_dayoff_wdays だけが使う（0 = 日曜）。全曜日を「なるべく休み」にする意味は無いので 6 個まで
  wdays       smallint[]  check (
    wdays is null
    or (cardinality(wdays) between 1 and 6 and wdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[])
  ),
  -- 登録順。013 で並べ替えの UI をやめたが、一覧の並びと v1 から移す行の順に使う
  position    integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (pattern1_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade,
  foreign key (pattern2_id, tenant_id) references public.patterns (id, tenant_id) on delete cascade,
  foreign key (staff_id, tenant_id) references public.staffs (id, tenant_id) on delete cascade,
  -- 「必ず休み」は staffs.available_wdays と同じ意味になるので、置き場所を 2 つにしない（013 §3.3）
  check (kind <> 'prefer_dayoff_wdays' or not hard),
  -- 土日祝の上限は表示期間（最長 31 日）で数える。1 か月の土日祝は 9〜12 日なので 7 では足りない（013 §9.6）
  check (days between 1 and (case when kind = 'max_weekend_days' then 15 else 7 end))
);

create index restrictions_tenant_position_idx on public.restrictions (tenant_id, position);
create index restrictions_pattern1_id_idx on public.restrictions (pattern1_id);
create index restrictions_pattern2_id_idx on public.restrictions (pattern2_id);
create index restrictions_staff_id_idx on public.restrictions (staff_id);

alter table public.restrictions enable row level security;

revoke all on public.restrictions from anon, authenticated;
grant select, insert, update, delete on public.restrictions to authenticated;

create policy restrictions_restrict_same_tenant on public.restrictions
  as restrictive for all to authenticated
  using (tenant_id in (select private.owned_tenant_ids()))
  with check (tenant_id in (select private.owned_tenant_ids()));

create policy restrictions_member_all on public.restrictions
  for all to authenticated
  using (true)
  with check (true);

create trigger restrictions_set_updated_at
  before update on public.restrictions
  for each row execute function private.set_updated_at();
