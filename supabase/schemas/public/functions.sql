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
