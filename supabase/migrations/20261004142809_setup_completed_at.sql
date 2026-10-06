SET local check_function_bodies = off;

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

ALTER TABLE "public"."tenants"
  ADD COLUMN "setup_completed_at" timestamp WITH time zone;

CREATE OR REPLACE FUNCTION private.guard_setup_completed_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if old.setup_completed_at is not null
     and new.setup_completed_at is distinct from old.setup_completed_at then
    raise exception 'setup_completed_at is immutable';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_setup (
  p_tenant_id   uuid,
  p_staff_names text[]
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.save_setup_patterns (
  p_tenant_id uuid,
  p_patterns  jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))));

CREATE TRIGGER tenants_guard_setup_completed_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_setup_completed_at();

GRANT EXECUTE ON FUNCTION "private"."guard_setup_completed_at"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."complete_setup"(uuid, text[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."complete_setup"(uuid, text[]) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) TO "anon";

REVOKE ALL ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) TO "anon";

REVOKE ALL ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."save_setup_patterns"(uuid, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."save_setup_patterns"(uuid, jsonb) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) TO "anon";

-- ---------------------------------------------------------------------------
-- 既存の店舗の埋め戻し（014 §5.1。pg-delta はデータを書かないので手で追記）
--
-- 条件は「スタッフが 1 人でもいる（退職者を含む）」。いまの完了判定（勤務あり かつ 在籍スタッフあり）にしないのは、
-- 全員退職した店やスタッフはいるが勤務 0 の店を「準備中」にすると、初期設定の勤務の置き換えで過去のシフトが消えたり
-- （shifts は patterns に on delete cascade）、「これで完成」でスタッフが二重になったりするため。
-- スタッフのいない店舗にはシフトが無いので、準備中に残しても消えて困るデータが無い。
-- ---------------------------------------------------------------------------
update public.tenants t
   set setup_completed_at = t.created_at
 where t.setup_completed_at is null
   and exists (select 1 from public.staffs s where s.tenant_id = t.id);

-- anon から public スキーマの全権限を外す（003 §3.3）。
--
-- なぜ schemas/ に置けないか:
--   Supabase は CREATE TABLE 時に anon / authenticated / service_role へ全権限を付ける
--   （config.toml の auto_expose_new_tables。クラウドの既定）。pg-delta は「宣言側の ACL に
--   現れるロール」だけを差分に出すため、権限を 1 つも持たせない anon については REVOKE を
--   生成しない（authenticated は SELECT 等を付けているので REVOKE + GRANT が出る）。
--   そのため schemas/ に revoke を書いても migration に落ちない。
--
-- 運用（AGENTS.md にも記載）:
--   新しいテーブル・シーケンス・関数を足した差分 migration の末尾に、このファイルを追記する（冪等）。
--     cat supabase/unmanaged/restrict_anon_grants.sql >> supabase/migrations/<ts>_<name>.sql
--   追記を忘れると npx supabase test db の「anon は ... を読めない」が落ちる。
--
-- RLS だけでも anon は 0 行しか読めないが、TRUNCATE は RLS を通らないので権限の層で閉じる。
-- 公開共有ページ（/share/[code]）は anon ではなく createPrivilegedClient()（service_role）で読む。

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon";
