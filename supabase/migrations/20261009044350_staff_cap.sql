SET local check_function_bodies = off;

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

ALTER TABLE "public"."profiles"
  ADD COLUMN "staff_cap" integer;

CREATE OR REPLACE FUNCTION private.staff_limit (
  p_owner uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select case
    when exists (
      select 1 from public.billing_subscriptions b
       where b.user_id = p_owner and b.status in ('active', 'trialing', 'past_due')
    ) then (select p.staff_cap from public.profiles p where p.id = p_owner)
    when exists (
      select 1 from public.profiles p where p.id = p_owner and p.trial_end > now()
    ) then null
    else greatest(10, coalesce((select p.max_staffs_count from public.profiles p where p.id = p_owner), 10))
  end;
$function$;

CREATE OR REPLACE FUNCTION public.set_staff_cap (
  p_cap integer
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_staff_cap_check" CHECK (((staff_cap >= 11) AND (staff_cap <= 1000)));

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))));

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

REVOKE ALL ON FUNCTION "public"."set_staff_cap"(integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_staff_cap"(integer) TO "anon", "authenticated", "postgres", "service_role";

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
