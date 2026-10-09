SET local check_function_bodies = off;

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

CREATE OR REPLACE FUNCTION private.guard_staff_limit()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_owner uuid;
  v_limit integer;
begin
  if auth.uid() is null then
    return new;
  end if;
  -- 在籍が増えない変更は見ない（退職のまま足す・在籍のまま更新する）
  if new.retired_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.retired_at is null then
    return new;
  end if;

  select t.owner_id into v_owner from public.tenants t where t.id = new.tenant_id;
  -- 自分の店舗でなければ何もせず、RLS（WITH CHECK）に弾かせる。BEFORE トリガは RLS より先に動くので、
  -- ここで上限を判定すると他人の店舗の存在とプランの状態が分かり、相手の行もロックしてしまう
  if v_owner is null or v_owner <> auth.uid() then
    return new;
  end if;

  -- 同時に 2 件足されて上限を超えないよう、利用者の単位で直列にする
  perform 1 from public.profiles p where p.id = v_owner for update;

  v_limit := private.staff_limit(v_owner);
  -- 行トリガは同じ文で先に処理した行を見るので、複数行の INSERT でも上限の行で止まる
  if v_limit is not null and private.active_staff_count(v_owner) + 1 > v_limit then
    raise exception 'staff_limit_exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$function$;

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_stripe_customer_id_key" UNIQUE (stripe_customer_id);

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
