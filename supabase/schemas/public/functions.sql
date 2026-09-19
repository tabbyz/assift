-- 並べ替え（006 §3.3 / §5.1）。
--
-- v1 の acts_as_list（隣と swap）は position が重複・欠番していると動かないことがあるため、
-- 表示中の id 配列をそのまま受け取り 0..n-1 で採番し直す。1 文の UPDATE なので原子的。
--
-- security invoker: 呼び出したユーザーの権限で動くので、テーブルの RLS
-- （{table}_restrict_same_tenant）がそのまま UPDATE に効く。別テナントの行は対象外になり
-- 更新行数が合わなくなるため、下の件数チェックで例外 → ロールバックする。
--
-- p_table はクライアントからは渡さない。reorderStaffs / reorderPatterns / reorderRestrictions の
-- 3 つの Server Action が定数で渡す。ホワイトリストは Action を経由しない直接呼び出しへの二重の守り。
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
  if p_table not in ('staffs', 'patterns', 'restrictions') then
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
