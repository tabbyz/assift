SET local check_function_bodies = off;

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

CREATE OR REPLACE FUNCTION public.admin_list_users (
  p_search text    DEFAULT NULL::text,
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
  RETURNS TABLE (
    id                  uuid,
    email               text,
    created_at          timestamp with time zone,
    last_sign_in_at     timestamp with time zone,
    providers           text[],
    trial_end           timestamp with time zone,
    max_staffs_count    integer,
    staff_cap           integer,
    subscription_status text,
    tenant_count        integer,
    active_staff_count  integer,
    total_count         bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))));

REVOKE ALL ON FUNCTION "public"."admin_list_users"(text, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."admin_list_users"(text, integer, integer) TO "postgres", "service_role";

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

REVOKE ALL ON FUNCTION "public"."set_staff_cap"(integer) FROM "anon";

GRANT EXECUTE ON FUNCTION "public"."set_staff_cap"(integer) TO "anon";

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

-- admin_list_users は service_role だけが呼ぶ（020 §6.1）。Supabase の既定の権限が新しい関数の EXECUTE を
-- authenticated にも付けるが、pg-delta は宣言側に authenticated が現れないので REVOKE を生成しない。ここで外す（冪等）
REVOKE ALL ON FUNCTION "public"."admin_list_users"(text, integer, integer) FROM "authenticated";
