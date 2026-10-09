SET local check_function_bodies = off;

ALTER TABLE "public"."plan_change_logs"
  DROP CONSTRAINT "plan_change_logs_user_id_fkey";

ALTER TABLE "public"."restrictions"
  DROP CONSTRAINT "restrictions_wdays_check";

ALTER TABLE "public"."profiles"
  DROP COLUMN "stripe_subscription_id";

DROP TABLE "public"."plan_change_logs";

CREATE TABLE "public"."billing_subscriptions" (
  "user_id"                uuid                     NOT NULL,
  "stripe_subscription_id" text                     NOT NULL,
  "status"                 text                     NOT NULL,
  "price_lookup_key"       text,
  "discount_percent"       smallint,
  "cancel_at"              timestamp with time zone,
  "current_period_start"   timestamp with time zone NOT NULL,
  "current_period_end"     timestamp with time zone NOT NULL,
  "has_schedule"           boolean                  NOT NULL DEFAULT false,
  "synced_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "billing_subscriptions_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "billing_subscriptions_stripe_subscription_id_key" UNIQUE (stripe_subscription_id)
);

ALTER TABLE "public"."billing_subscriptions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff_count_history" (
  "id"           bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "user_id"      uuid                     NOT NULL,
  "active_count" integer                  NOT NULL,
  "changed_at"   timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT "staff_count_history_active_count_check" CHECK ((active_count >= 0)),
  CONSTRAINT "staff_count_history_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."staff_count_history"
  ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION private.active_staff_count (
  p_owner uuid
)
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select count(*)::integer
    from public.staffs s
    join public.tenants t on t.id = s.tenant_id
   where t.owner_id = p_owner
     and s.retired_at is null;
$function$;

CREATE OR REPLACE FUNCTION private.append_staff_count (
  p_owner uuid,
  p_count integer
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not exists (select 1 from public.profiles p where p.id = p_owner) then
    return;
  end if;
  if p_count is not distinct from (
    select h.active_count from public.staff_count_history h
     where h.user_id = p_owner
     order by h.changed_at desc, h.id desc
     limit 1
  ) then
    return;
  end if;
  insert into public.staff_count_history (user_id, active_count) values (p_owner, p_count);
end;
$function$;

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
  if v_owner is null then
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
  perform private.append_staff_count(v_owner, private.active_staff_count(v_owner));
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
  perform private.append_staff_count(
    old.owner_id,
    private.active_staff_count(old.owner_id)
      - (select count(*)::integer from public.staffs s where s.tenant_id = old.id and s.retired_at is null)
  );
  return old;
end;
$function$;

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
    ) then null
    when exists (
      select 1 from public.profiles p where p.id = p_owner and p.trial_end > now()
    ) then null
    else greatest(10, coalesce((select p.max_staffs_count from public.profiles p where p.id = p_owner), 10))
  end;
$function$;

CREATE OR REPLACE FUNCTION private.trial_end_from (
  p_now timestamp with time zone
)
  RETURNS timestamp WITH time zone
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select (date_trunc('month', p_now at time zone 'Asia/Tokyo') + interval '3 months') at time zone 'Asia/Tokyo';
$function$;

CREATE OR REPLACE FUNCTION public.start_trial()
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."billing_subscriptions"
  ADD CONSTRAINT "billing_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))));

ALTER TABLE "public"."staff_count_history"
  ADD CONSTRAINT "staff_count_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX staff_count_history_user_changed_idx ON public.staff_count_history USING btree (user_id, changed_at);

CREATE TRIGGER staffs_guard_staff_limit
  BEFORE INSERT OR UPDATE OF retired_at ON public.staffs
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_staff_limit();

CREATE TRIGGER staffs_record_staff_count
  AFTER INSERT OR DELETE OR UPDATE OF retired_at ON public.staffs
  FOR EACH ROW
  EXECUTE FUNCTION private.record_staff_count();

CREATE TRIGGER tenants_record_tenant_delete
  BEFORE DELETE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION private.record_tenant_delete();

CREATE POLICY "billing_subscriptions_select_own" ON "public"."billing_subscriptions"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "staff_count_history_select_own" ON "public"."staff_count_history"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

REVOKE ALL ON FUNCTION "private"."active_staff_count"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."active_staff_count"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."append_staff_count"(uuid, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."append_staff_count"(uuid, integer) TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."guard_staff_limit"() TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_staff_count"() TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_tenant_delete"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."staff_limit"(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."staff_limit"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "private"."trial_end_from"(timestamp WITH time zone) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."trial_end_from"(timestamp WITH time zone) TO "postgres";

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

REVOKE ALL ON FUNCTION "public"."start_trial"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."start_trial"() TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."billing_subscriptions" FROM "authenticated";

GRANT SELECT ON TABLE "public"."billing_subscriptions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."billing_subscriptions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."staff_count_history" FROM "authenticated";

GRANT SELECT ON TABLE "public"."staff_count_history" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_count_history" TO "postgres", "service_role";

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
