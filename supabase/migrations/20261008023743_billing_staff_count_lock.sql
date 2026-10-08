SET local check_function_bodies = off;

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

DROP FUNCTION "private"."append_staff_count"(uuid, integer);

CREATE OR REPLACE FUNCTION private.record_owner_staff_count (
  p_owner           uuid,
  p_excluded_tenant uuid DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_count integer;
begin
  perform 1 from public.profiles p where p.id = p_owner for update;
  if not found then
    return;
  end if;
  v_count := private.active_staff_count(p_owner)
    - (select count(*)::integer from public.staffs s
        where p_excluded_tenant is not null and s.tenant_id = p_excluded_tenant and s.retired_at is null);
  if v_count is not distinct from (
    select h.active_count from public.staff_count_history h
     where h.user_id = p_owner
     order by h.changed_at desc, h.id desc
     limit 1
  ) then
    return;
  end if;
  insert into public.staff_count_history (user_id, active_count) values (p_owner, v_count);
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_staff_count()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid;
begin
  select t.owner_id into v_owner
    from public.tenants t
   where t.id = case when tg_op = 'DELETE' then old.tenant_id else new.tenant_id end;
  if v_owner is null then
    return null;
  end if;
  perform private.record_owner_staff_count(v_owner);
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_tenant_delete()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.record_owner_staff_count(old.owner_id, old.id);
  return old;
end;
$function$;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))));

REVOKE ALL ON FUNCTION "private"."record_owner_staff_count"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."record_owner_staff_count"(uuid, uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."complete_setup"(uuid, text[]) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."complete_setup"(uuid, text[]) TO "anon";

REVOKE ALL ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) TO "anon";

REVOKE ALL ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) TO "anon";

REVOKE ALL ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."save_setup_patterns"(uuid, jsonb) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."save_setup_patterns"(uuid, jsonb) TO "anon";

REVOKE ALL ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) TO "anon";

REVOKE ALL ON FUNCTION "public"."start_trial"() FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."start_trial"() TO "anon";
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
