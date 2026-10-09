-- 並べ替え（006 §3.3 / §5.1）。
--
-- v1 の acts_as_list（隣と swap）は position が重複・欠番していると動かないことがあるため、
-- 表示中の id 配列をそのまま受け取り 0..n-1 で採番し直す。1 文の UPDATE なので原子的。
--
-- security invoker: 呼び出したユーザーの権限で動くので、テーブルの RLS
-- （{table}_restrict_same_tenant）がそのまま UPDATE に効く。別テナントの行は対象外になり
-- 更新行数が合わなくなるため、下の件数チェックで例外 → ロールバックする。
--
-- p_table はクライアントからは渡さない。reorderStaffs / reorderPatterns の
-- 2 つの Server Action が定数で渡す。ホワイトリストは Action を経由しない直接呼び出しへの二重の守り。
-- restrictions は 013 で並べ替えをやめた（店舗全体 / スタッフ別の 2 群に分けたので、上下ボタンの意味が薄い）。
create or replace function public.reorder_positions(
  p_table     text,
  p_tenant_id uuid,
  p_ids       uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  expected integer := coalesce(array_length(p_ids, 1), 0);
  updated  integer;
begin
  if p_table not in ('staffs', 'patterns') then
    raise exception 'reorder_positions: unsupported table %', p_table;
  end if;

  if expected = 0 then
    raise exception 'reorder_positions: empty id list';
  end if;

  execute format(
    'update public.%I t
        set "position" = o.ord - 1
       from unnest($1) with ordinality as o(id, ord)
      where t.id = o.id and t.tenant_id = $2',
    p_table
  ) using p_ids, p_tenant_id;

  get diagnostics updated = row_count;

  -- 別テナントの id が混ざった / 別タブで削除された / 重複した id を渡した
  if updated <> expected then
    raise exception 'reorder_positions: % of % rows updated', updated, expected;
  end if;
end;
$$;

-- EXECUTE は既定で PUBLIC に付く。Supabase の ALTER DEFAULT PRIVILEGES で anon にも付くため、
-- PUBLIC から外して authenticated だけに付け直す（anon は unmanaged/restrict_anon_grants.sql でも外れる）
revoke execute on function public.reorder_positions(text, uuid, uuid[]) from public;
grant execute on function public.reorder_positions(text, uuid, uuid[]) to authenticated;

-- アサイン（007 §3.2 / §5.2）。
--
-- v1 の ShiftsController#assign（既存削除 → ペア削除 → 作成 → ペア作成）を 1 トランザクションにする。
-- PostgREST の 3 呼び出しに分けると、途中で失敗したときに「本体は消えたがペアは残る」が起きる。
--
-- security invoker: reorder_positions と同じ。テーブルの RLS がそのまま効き、他テナントの
-- staff / pattern は「見えない」= not found になる（存在を漏らさない）。
--
-- p_pattern_id は「空」（アサイン解除）のとき省略する。default null にしているのは、
-- supabase gen types が既定値の無い引数を必須の非 null で出すため（007 §5.2）。
create or replace function public.assign_shift(
  p_tenant_id  uuid,
  p_staff_id   uuid,
  p_date       date,
  p_fixed      boolean,
  p_pattern_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_current_id      uuid;
  v_current_pattern uuid;
  v_old_pair        uuid;
  v_new_pair        uuid;
begin
  -- RLS で他テナントの staff は見えない。存在しない id と同じ文言にする
  if not exists (
    select 1 from public.staffs where id = p_staff_id and tenant_id = p_tenant_id
  ) then
    raise exception 'assign_shift: staff not found';
  end if;

  select id, pattern_id into v_current_id, v_current_pattern
    from public.shifts
   where tenant_id = p_tenant_id and staff_id = p_staff_id and date = p_date;

  if v_current_id is not null then
    select pair_pattern_id into v_old_pair
      from public.patterns
     where id = v_current_pattern and tenant_id = p_tenant_id;

    -- v1 は翌日をパターン問わず削除していた。v2 は「翌日がそのペアパターンのときだけ」消す
    -- （手で入れた翌日のシフトを巻き込まない。001 §4.4 の改善）
    if v_old_pair is not null then
      delete from public.shifts
       where tenant_id = p_tenant_id
         and staff_id = p_staff_id
         and date = p_date + 1
         and pattern_id = v_old_pair;
    end if;

    delete from public.shifts where id = v_current_id;
  end if;

  -- 「空」= アサイン解除。ここで終わる
  if p_pattern_id is null then
    return;
  end if;

  select pair_pattern_id into v_new_pair
    from public.patterns
   where id = p_pattern_id and tenant_id = p_tenant_id;
  if not found then
    raise exception 'assign_shift: pattern not found';
  end if;

  insert into public.shifts (tenant_id, staff_id, pattern_id, date, fixed)
  values (p_tenant_id, p_staff_id, p_pattern_id, p_date, p_fixed);

  -- ペアは翌日を上書きする（v1 の find_or_initialize_by → pattern_id 代入と同じ）。連鎖はしない
  if v_new_pair is not null then
    insert into public.shifts (tenant_id, staff_id, pattern_id, date, fixed)
    values (p_tenant_id, p_staff_id, v_new_pair, p_date + 1, p_fixed)
        on conflict (staff_id, date)
        do update set pattern_id = excluded.pattern_id, fixed = excluded.fixed;
  end if;
end;
$$;

revoke execute on function public.assign_shift(uuid, uuid, date, boolean, uuid) from public;
grant execute on function public.assign_shift(uuid, uuid, date, boolean, uuid) to authenticated;

-- 一括操作（008 §10.13）。
--
-- 対象は「表に出ている在籍スタッフ」の行だけ（staffs.retired_at is null）。この絞り込みは staffs との join が要り、
-- PostgREST の UPDATE / DELETE では書けない（在籍 id を URL に並べて分割する回避策になる）ので RPC にする。
-- 1 文なので半端な状態が生まれず、行数は get diagnostics で返す。
--
-- security invoker: assign_shift と同じ。テーブルの RLS がそのまま効く。
-- 店舗・スタッフが見えないときは not found（他テナントも存在しない id も同じ文言。存在を漏らさない）。
-- TS 側はこの例外を文言に写すだけで、事前の存在確認の往復を持たない。
create or replace function public.set_shifts_fixed(
  p_tenant_id uuid,
  p_start     date,
  p_end       date,
  p_fixed     boolean,
  p_staff_id  uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 他テナント / 存在しない店舗は RLS で見えない。0 行で返すと「対象なし」と区別できないので例外にする
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'set_shifts_fixed: tenant not found';
  end if;

  -- スタッフ指定は在籍者に限る。退職者（画面に出ない）を指す古いタブからの呼び出しは not found にして読み直させる
  if p_staff_id is not null and not exists (
    select 1 from public.staffs
     where id = p_staff_id and tenant_id = p_tenant_id and retired_at is null
  ) then
    raise exception 'set_shifts_fixed: staff not found';
  end if;

  -- 値が変わる行だけ書く。既に確定の行に「確定」を当てても触らず、件数にも入れない
  -- （呼び出し側は 0 件を「対象なし」として灰色で伝える。updated_at も動かさない）
  update public.shifts s
     set fixed = p_fixed
   where s.tenant_id = p_tenant_id
     and s.fixed is distinct from p_fixed
     and s.date between p_start and p_end
     and (p_staff_id is null or s.staff_id = p_staff_id)
     and s.staff_id in (
       select st.id from public.staffs st
        where st.tenant_id = p_tenant_id and st.retired_at is null
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.set_shifts_fixed(uuid, date, date, boolean, uuid) from public;
grant execute on function public.set_shifts_fixed(uuid, date, date, boolean, uuid) to authenticated;

-- 下書きだけ消す。確定は残す。ペアは追わない（v1 の clear と同じ。008 §2）
create or replace function public.clear_draft_shifts(
  p_tenant_id uuid,
  p_start     date,
  p_end       date,
  p_staff_id  uuid default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  -- 他テナント / 存在しない店舗は RLS で見えない。0 行で返すと「対象なし」と区別できないので例外にする
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'clear_draft_shifts: tenant not found';
  end if;

  -- スタッフ指定は在籍者に限る。退職者（画面に出ない）を指す古いタブからの呼び出しは not found にして読み直させる
  if p_staff_id is not null and not exists (
    select 1 from public.staffs
     where id = p_staff_id and tenant_id = p_tenant_id and retired_at is null
  ) then
    raise exception 'clear_draft_shifts: staff not found';
  end if;

  delete from public.shifts s
   where s.tenant_id = p_tenant_id
     and s.fixed = false
     and s.date between p_start and p_end
     and (p_staff_id is null or s.staff_id = p_staff_id)
     and s.staff_id in (
       select st.id from public.staffs st
        where st.tenant_id = p_tenant_id and st.retired_at is null
     );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.clear_draft_shifts(uuid, date, date, uuid) from public;
grant execute on function public.clear_draft_shifts(uuid, date, date, uuid) to authenticated;

-- シフトコピー（008 §10.15）。
--
-- コピー元の行を app に往復させず、`insert ... select` 1 文で写す。在籍スタッフの絞り込み（staffs との join）は
-- set_shifts_fixed / clear_draft_shifts と同じ規則。1 文なのでスナップショットとして一貫し、ページングの境界の問題も無い。
-- 既にあるセルは `on conflict do nothing` で上書きしない。fixed は引き継がず下書きで入る（v1 と同じ）。
-- 戻り値は実際に入った行数。コピー元に条件に合う行が 1 つも無ければ `no source` を投げる
-- （「全部埋まっていて 0 件」と区別して伝えるため）。
create or replace function public.copy_shifts(
  p_tenant_id   uuid,
  p_from_start  date,
  p_from_end    date,
  p_to_start    date,
  p_pattern_ids uuid[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offset integer := p_to_start - p_from_start;
  v_count  integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'copy_shifts: tenant not found';
  end if;

  if not exists (
    select 1 from public.shifts s
     where s.tenant_id = p_tenant_id
       and s.date between p_from_start and p_from_end
       and s.pattern_id = any(p_pattern_ids)
       and s.staff_id in (
         select st.id from public.staffs st
          where st.tenant_id = p_tenant_id and st.retired_at is null
       )
  ) then
    raise exception 'copy_shifts: no source';
  end if;

  insert into public.shifts (tenant_id, staff_id, pattern_id, date, fixed)
  select s.tenant_id, s.staff_id, s.pattern_id, s.date + v_offset, false
    from public.shifts s
   where s.tenant_id = p_tenant_id
     and s.date between p_from_start and p_from_end
     and s.pattern_id = any(p_pattern_ids)
     and s.staff_id in (
       select st.id from public.staffs st
        where st.tenant_id = p_tenant_id and st.retired_at is null
     )
  on conflict (staff_id, date) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.copy_shifts(uuid, date, date, date, uuid[]) from public;
grant execute on function public.copy_shifts(uuid, date, date, date, uuid[]) to authenticated;

-- 自動アサインを元に戻す（012 §5.8）。v1 の `Shift.where(assist_token:).destroy_all` の後継。
--
-- v1 はテナントを絞らず、確定へ変えた行まで消していた。v2 は店舗で絞り、下書き（fixed = false）だけを消す
-- （店長がその後に確定へ変えたセルは残す）。行数を返し、run に rolled_back_at を記録する。
--
-- 対象は succeeded の run だけ。running を戻すと完了後に行だけ残り、failed は行を書いていない。
-- どちらも存在しない run と同じ `run not found` にする。2 回目の呼び出しは通る（残っている下書きが 0 行なら 0 を返す）。
--
-- security invoker: 他の RPC と同じ。テーブルの RLS がそのまま効き、他テナントの run は見えない = not found。
create or replace function public.rollback_assist_run(
  p_tenant_id uuid,
  p_run_id    uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'rollback_assist_run: tenant not found';
  end if;

  update public.assist_runs
     set rolled_back_at = coalesce(rolled_back_at, now())
   where id = p_run_id and tenant_id = p_tenant_id and status = 'succeeded';
  if not found then
    raise exception 'rollback_assist_run: run not found';
  end if;

  delete from public.shifts
   where tenant_id = p_tenant_id
     and assist_run_id = p_run_id
     and fixed = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.rollback_assist_run(uuid, uuid) from public;
grant execute on function public.rollback_assist_run(uuid, uuid) to authenticated;

-- 初期設定のステップ 2: 勤務をまとめて保存する（014 §5.2）。
--
-- 店舗の勤務を全部消して入れ直す（置き換え）。置き換えてよいのは「準備中で、スタッフが 1 人もいない」店舗だけ。
-- スタッフがいなければシフトも無い（shifts は staffs への FK を持つ）ので、消えて困るデータが無い。
-- この前提をアプリに任せず、先頭で検査する（完了済み / スタッフあり は例外）。
--
-- 店舗の行を for update でロックする: 「これで完成」と同時に走ったり 2 タブから呼ばれたりしたとき、
-- 後の方は前の方の確定を待ってから検査する（ロックが無いと、どちらも準備中を見てから書き始める）。
--
-- p_patterns は [{ id, name, description, color_hex, kind, pair_id }]。id は Server Action が振る
-- （ペアを id で書けるようにするため）。position は配列の順。
-- ペアは insert のあとに update で張る（同じ insert の中で自分を参照させない）。
create or replace function public.save_setup_patterns(
  p_tenant_id uuid,
  p_patterns  jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
  v_expected     integer := coalesce(jsonb_array_length(p_patterns), 0);
  v_count        integer;
begin
  select setup_completed_at into v_completed_at
    from public.tenants where id = p_tenant_id
     for update;
  if not found then
    raise exception 'save_setup_patterns: tenant not found';
  end if;
  if v_completed_at is not null then
    raise exception 'save_setup_patterns: setup completed';
  end if;
  if exists (select 1 from public.staffs where tenant_id = p_tenant_id) then
    raise exception 'save_setup_patterns: has staffs';
  end if;
  if v_expected = 0 then
    raise exception 'save_setup_patterns: no patterns';
  end if;

  delete from public.patterns where tenant_id = p_tenant_id;

  insert into public.patterns (id, tenant_id, name, description, color_hex, kind, position)
  select (r.value ->> 'id')::uuid,
         p_tenant_id,
         r.value ->> 'name',
         nullif(r.value ->> 'description', ''),
         r.value ->> 'color_hex',
         (r.value ->> 'kind')::public.pattern_kind,
         (r.ord - 1)::integer
    from jsonb_array_elements(p_patterns) with ordinality as r(value, ord);

  get diagnostics v_count = row_count;
  if v_count <> v_expected then
    raise exception 'save_setup_patterns: % of % rows inserted', v_count, v_expected;
  end if;

  update public.patterns p
     set pair_pattern_id = (r.value ->> 'pair_id')::uuid
    from jsonb_array_elements(p_patterns) as r(value)
   where p.tenant_id = p_tenant_id
     and p.id = (r.value ->> 'id')::uuid
     and r.value ->> 'pair_id' is not null;

  return v_count;
end;
$$;

revoke execute on function public.save_setup_patterns(uuid, jsonb) from public;
grant execute on function public.save_setup_patterns(uuid, jsonb) to authenticated;

-- 初期設定のステップ 3: スタッフを作って完了を記録する（014 §5.2）。
--
-- スタッフの作成・全勤務の staff_patterns・完了日時を 1 トランザクションにする。
-- 分けると、途中で失敗したときに「スタッフはいるが準備中」の店舗が残り、再開時にスタッフが二重になる。
-- 検査とロックは save_setup_patterns と同じ。二度押しの 2 回目はロックを待ってから 'setup completed' になる
-- （ロックが無いと完了日時の update でトリガに当たり 'immutable' になる）。
--
-- スタッフの曜日・週の上限は DB の既定値（全曜日・週 5）。選べる勤務は全部（いまの新規フォームと同じ）。
create or replace function public.complete_setup(
  p_tenant_id   uuid,
  p_staff_names text[]
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_completed_at timestamptz;
  v_expected     integer := coalesce(array_length(p_staff_names, 1), 0);
  v_count        integer;
begin
  select setup_completed_at into v_completed_at
    from public.tenants where id = p_tenant_id
     for update;
  if not found then
    raise exception 'complete_setup: tenant not found';
  end if;
  if v_completed_at is not null then
    raise exception 'complete_setup: setup completed';
  end if;
  if exists (select 1 from public.staffs where tenant_id = p_tenant_id) then
    raise exception 'complete_setup: has staffs';
  end if;
  if not exists (select 1 from public.patterns where tenant_id = p_tenant_id) then
    raise exception 'complete_setup: no patterns';
  end if;
  if v_expected = 0 then
    raise exception 'complete_setup: no staffs';
  end if;

  insert into public.staffs (tenant_id, name, position)
  select p_tenant_id, n.name, (n.ord - 1)::integer
    from unnest(p_staff_names) with ordinality as n(name, ord);

  get diagnostics v_count = row_count;
  if v_count <> v_expected then
    raise exception 'complete_setup: % of % staffs inserted', v_count, v_expected;
  end if;

  insert into public.staff_patterns (tenant_id, staff_id, pattern_id)
  select p_tenant_id, s.id, p.id
    from public.staffs s
   cross join public.patterns p
   where s.tenant_id = p_tenant_id
     and p.tenant_id = p_tenant_id;

  update public.tenants set setup_completed_at = now() where id = p_tenant_id;

  return v_count;
end;
$$;

revoke execute on function public.complete_setup(uuid, text[]) from public;
grant execute on function public.complete_setup(uuid, text[]) to authenticated;

-- トライアルを始める（019 §7）。1 アカウント 1 回、始めた日から 2 か月後の月末まで、在籍スタッフの上限なし。
-- profiles に UPDATE を付けない（trial_end や stripe_customer_id を書き換えさせない）ための RPC。
-- 1 行の更新だが、AGENTS.md の「RPC は複数行を 1 文で書き換えるときだけ」の例外（019 §5.2）。
-- 引数を取らない（他人の行を指せない）。返すのはトライアルの終わり（その次の瞬間）
create or replace function public.start_trial()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_end timestamptz;
begin
  if v_uid is null then
    raise exception 'start_trial: not authenticated';
  end if;
  if exists (
    select 1 from public.billing_subscriptions b
     where b.user_id = v_uid and b.status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'start_trial: subscribed';
  end if;

  v_end := private.trial_end_from(now());
  update public.profiles set trial_end = v_end where id = v_uid and trial_end is null;
  if not found then
    raise exception 'start_trial: already used';
  end if;
  return v_end;
end;
$$;

revoke execute on function public.start_trial() from public;
grant execute on function public.start_trial() to authenticated;

-- 有料プランの在籍スタッフの上限を決める（019 §13.4）。請求には使わない（請求は実人数の最大）。
-- profiles に UPDATE を付けない（trial_end や stripe_customer_id を書き換えさせない）ための RPC。start_trial と同じく
-- 1 行の更新だが、AGENTS.md の「RPC は複数行を 1 文で書き換えるときだけ」の例外。引数で利用者を受けない（他人の行を指せない）。
-- 有料プランでなくても書ける（申し込みの確認画面が Checkout の前に保存する）。効くのは有料プランのときだけ（private.staff_limit）。
-- 門番（private.guard_staff_limit）と同じ行をロックしてから数える。ロックしないと、上限を下げるのと同時にスタッフを足されて
-- 上限を超えた状態ができる
create or replace function public.set_staff_cap(p_cap integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'set_staff_cap: not authenticated';
  end if;
  if p_cap is null or p_cap < 11 or p_cap > 1000 then
    raise exception 'set_staff_cap: out of range';
  end if;

  perform 1 from public.profiles p where p.id = v_uid for update;
  if not found then
    raise exception 'set_staff_cap: not authenticated';
  end if;
  if p_cap < private.active_staff_count(v_uid) then
    raise exception 'set_staff_cap: below active count';
  end if;

  update public.profiles set staff_cap = p_cap where id = v_uid;
  return p_cap;
end;
$$;

revoke execute on function public.set_staff_cap(integer) from public;
grant execute on function public.set_staff_cap(integer) to authenticated;

-- 運営者の管理画面のユーザー一覧（020 §6.1）。行を取ってから数えると max_rows（1000）で黙って切られ、
-- auth.users / auth.identities は PostgREST から読めないので、1 ページ分と総数をまとめて返す。
-- security definer は auth スキーマを読むため。呼べるのは service_role だけ（lib/admin/ の createAdminClient()）。
-- 先にページの範囲に絞ってから集計する（count(*) over () で総数を数えると、全行の副問い合わせが走る）。
-- 契約の状態（権利の規則）はここでは組み立てない（TS の entitlement() で組む。規則を SQL にもう 1 つ書かない）
create or replace function public.admin_list_users(
  p_search text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns table (
  id                  uuid,
  email               text,
  created_at          timestamptz,
  last_sign_in_at     timestamptz,
  providers           text[],
  trial_end           timestamptz,
  max_staffs_count    integer,
  staff_cap           integer,
  subscription_status text,
  tenant_count        integer,
  active_staff_count  integer,
  total_count         bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select p.id, p.email, p.created_at, p.trial_end, p.max_staffs_count, p.staff_cap
      from public.profiles p
     where p_search is null or strpos(lower(p.email), lower(p_search)) > 0
  ),
  page as (
    select * from filtered f
     order by f.created_at desc, f.id
     limit least(greatest(p_limit, 1), 100) offset greatest(p_offset, 0)
  )
  select pg.id, pg.email, pg.created_at, u.last_sign_in_at,
         coalesce((select array_agg(distinct i.provider order by i.provider)
                     from auth.identities i where i.user_id = pg.id), '{}'),
         pg.trial_end, pg.max_staffs_count, pg.staff_cap, s.status,
         (select count(*) from public.tenants t where t.owner_id = pg.id)::integer,
         private.active_staff_count(pg.id),
         (select count(*) from filtered)
    from page pg
    join auth.users u on u.id = pg.id
    left join public.billing_subscriptions s on s.user_id = pg.id
   order by pg.created_at desc, pg.id;
$$;

revoke execute on function public.admin_list_users(text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to service_role;
