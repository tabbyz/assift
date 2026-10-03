SET local check_function_bodies = off;

CREATE SCHEMA "private";

CREATE TABLE "public"."assist_runs" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       uuid                     NOT NULL,
  "start_date"      date                     NOT NULL,
  "end_date"        date                     NOT NULL,
  "instructions"    text,
  "models"          jsonb,
  "request"         jsonb,
  "result"          jsonb,
  "usage"           jsonb,
  "error"           text,
  "acknowledged_at" timestamp with time zone,
  "rolled_back_at"  timestamp with time zone,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "assist_runs_check" CHECK (((end_date >= start_date) AND ((end_date - start_date) < 31))),
  CONSTRAINT "assist_runs_id_tenant_id_key" UNIQUE (id, tenant_id),
  CONSTRAINT "assist_runs_instructions_check" CHECK ((char_length(instructions) <= 500)),
  CONSTRAINT "assist_runs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."assist_runs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."date_notes" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "date"       date                     NOT NULL,
  "note"       text                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "date_notes_note_check" CHECK (((char_length(note) >= 1) AND (char_length(note) <= 12))),
  CONSTRAINT "date_notes_pkey" PRIMARY KEY (id),
  CONSTRAINT "date_notes_tenant_id_date_key" UNIQUE (tenant_id, date)
);

ALTER TABLE "public"."date_notes"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."patterns" (
  "id"                    uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             uuid                     NOT NULL,
  "name"                  text                     NOT NULL,
  "description"           text,
  "color_hex"             text                     NOT NULL DEFAULT '#FFFFFF'::text,
  "pair_pattern_id"       uuid,
  "position"              integer                  NOT NULL DEFAULT 0,
  "default_required_nums" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "patterns_color_hex_check" CHECK ((color_hex ~ '^#[0-9A-Fa-f]{6}$'::text)),
  CONSTRAINT "patterns_description_check" CHECK ((char_length(description) <= 10)),
  CONSTRAINT "patterns_id_tenant_id_key" UNIQUE (id, tenant_id),
  CONSTRAINT "patterns_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 6))),
  CONSTRAINT "patterns_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."patterns"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."plan_change_logs" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"      uuid                     NOT NULL,
  "staffs_count" integer                  NOT NULL,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "plan_change_logs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."plan_change_logs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."profiles" (
  "id"                     uuid                     NOT NULL,
  "email"                  text,
  "is_admin"               boolean                  NOT NULL DEFAULT false,
  "stripe_customer_id"     text,
  "stripe_subscription_id" text,
  "trial_end"              timestamp with time zone,
  "max_staffs_count"       integer,
  "created_at"             timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"             timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."required_nums" (
  "id"         uuid     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid     NOT NULL,
  "pattern_id" uuid     NOT NULL,
  "date"       date     NOT NULL,
  "num"        smallint NOT NULL DEFAULT 0,
  CONSTRAINT "required_nums_num_check" CHECK ((num >= 0)),
  CONSTRAINT "required_nums_pattern_id_date_key" UNIQUE (pattern_id, date),
  CONSTRAINT "required_nums_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."required_nums"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."restrictions" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   uuid                     NOT NULL,
  "days"        smallint,
  "pattern1_id" uuid,
  "pattern2_id" uuid,
  "staff_id"    uuid,
  "hard"        boolean                  NOT NULL DEFAULT true,
  "wdays"       smallint[],
  "position"    integer                  NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "restrictions_pkey" PRIMARY KEY (id),
  CONSTRAINT "restrictions_wdays_check"
    CHECK
    (((wdays IS NULL) OR (((cardinality(wdays) >= 1) AND (cardinality(wdays) <= 6)) AND (wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint,
    (5)::smallint, (6)::smallint]))))
);

ALTER TABLE "public"."restrictions"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."shares" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"  uuid                     NOT NULL,
  "code"       text                     NOT NULL,
  "start_date" date                     NOT NULL,
  "end_date"   date                     NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shares_check" CHECK (((end_date >= start_date) AND ((end_date - start_date) <= 31))),
  CONSTRAINT "shares_code_check" CHECK ((code ~ '^[A-Za-z0-9]{8}$'::text)),
  CONSTRAINT "shares_code_key" UNIQUE (code),
  CONSTRAINT "shares_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."shares"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."shifts" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"     uuid                     NOT NULL,
  "staff_id"      uuid                     NOT NULL,
  "pattern_id"    uuid                     NOT NULL,
  "date"          date                     NOT NULL,
  "fixed"         boolean                  NOT NULL DEFAULT false,
  "assist_run_id" uuid,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shifts_pkey" PRIMARY KEY (id),
  CONSTRAINT "shifts_staff_id_date_key" UNIQUE (staff_id, date)
);

ALTER TABLE "public"."shifts"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff_default_patterns" (
  "tenant_id"  uuid NOT NULL,
  "staff_id"   uuid NOT NULL,
  "day_key"    text NOT NULL,
  "pattern_id" uuid NOT NULL,
  CONSTRAINT "staff_default_patterns_day_key_check" CHECK ((day_key = ANY (ARRAY['0'::text, '1'::text, '2'::text, '3'::text, '4'::text, '5'::text, '6'::text, 'holiday'::text]))),
  CONSTRAINT "staff_default_patterns_pkey" PRIMARY KEY (staff_id, day_key)
);

ALTER TABLE "public"."staff_default_patterns"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staff_patterns" (
  "tenant_id"  uuid NOT NULL,
  "staff_id"   uuid NOT NULL,
  "pattern_id" uuid NOT NULL,
  CONSTRAINT "staff_patterns_pkey" PRIMARY KEY (staff_id, pattern_id)
);

ALTER TABLE "public"."staff_patterns"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."staffs" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       uuid                     NOT NULL,
  "name"            text                     NOT NULL,
  "position"        integer                  NOT NULL DEFAULT 0,
  "retired_at"      timestamp with time zone,
  "available_wdays" smallint[]               NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::smallint[],
  "max_work_week"   smallint                 NOT NULL DEFAULT 5,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "staffs_available_wdays_check"
    CHECK ((available_wdays <@ ARRAY[(0)::smallint, (1)::smallint, (2)::smallint, (3)::smallint, (4)::smallint, (5)::smallint, (6)::smallint])),
  CONSTRAINT "staffs_id_tenant_id_key" UNIQUE (id, tenant_id),
  CONSTRAINT "staffs_max_work_week_check" CHECK (((max_work_week >= 0) AND (max_work_week <= 7))),
  CONSTRAINT "staffs_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 10))),
  CONSTRAINT "staffs_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."staffs"
  ENABLE ROW LEVEL SECURITY;

CREATE TABLE "public"."tenants" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "name"          text                     NOT NULL,
  "start_of_week" smallint                 NOT NULL DEFAULT 0,
  "assist_notes"  text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tenants_assist_notes_check" CHECK ((char_length(assist_notes) <= 500)),
  CONSTRAINT "tenants_name_check" CHECK (((char_length(name) >= 1) AND (char_length(name) <= 20))),
  CONSTRAINT "tenants_pkey" PRIMARY KEY (id),
  CONSTRAINT "tenants_start_of_week_check" CHECK (((start_of_week >= 0) AND (start_of_week <= 6))),
  "owner_id"      uuid                     NOT NULL DEFAULT auth.uid()
);

ALTER TABLE "public"."tenants"
  ENABLE ROW LEVEL SECURITY;

CREATE TYPE "public"."assist_run_status" AS ENUM (
  'running',
  'succeeded',
  'failed'
);

ALTER TABLE "public"."assist_runs"
  ADD COLUMN "status" public.assist_run_status NOT NULL DEFAULT 'running'::public.assist_run_status;

CREATE TYPE "public"."pattern_kind" AS ENUM (
  'workday',
  'dayoff'
);

ALTER TABLE "public"."patterns"
  ADD COLUMN "kind" public.pattern_kind NOT NULL DEFAULT 'workday'::public.pattern_kind;

CREATE TYPE "public"."restriction_kind" AS ENUM (
  'deny_pattern_pair',
  'max_work_week',
  'max_work_consecutive',
  'sat_or_sun_dayoff',
  'min_work_week',
  'max_weekend_days',
  'prefer_dayoff_wdays'
);

ALTER TABLE "public"."restrictions"
  ADD COLUMN "kind" public.restriction_kind NOT NULL;

CREATE TYPE "public"."shift_cycle" AS ENUM (
  'month',
  'half_month',
  'two_week',
  'week'
);

ALTER TABLE "public"."tenants"
  ADD COLUMN "shift_cycle" public.shift_cycle NOT NULL DEFAULT 'month'::public.shift_cycle;

CREATE OR REPLACE FUNCTION private.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.owned_tenant_ids()
  RETURNS SETOF uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select t.id from public.tenants t where t.owner_id = (select auth.uid());
$function$;

CREATE OR REPLACE FUNCTION private.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.sync_profile_email()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assign_shift (
  p_tenant_id  uuid,
  p_staff_id   uuid,
  p_date       date,
  p_fixed      boolean,
  p_pattern_id uuid    DEFAULT NULL::uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.clear_draft_shifts (
  p_tenant_id uuid,
  p_start     date,
  p_end       date,
  p_staff_id  uuid DEFAULT NULL::uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.copy_shifts (
  p_tenant_id   uuid,
  p_from_start  date,
  p_from_end    date,
  p_to_start    date,
  p_pattern_ids uuid[]
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.reorder_positions (
  p_table     text,
  p_tenant_id uuid,
  p_ids       uuid[]
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.rollback_assist_run (
  p_tenant_id uuid,
  p_run_id    uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.set_shifts_fixed (
  p_tenant_id uuid,
  p_start     date,
  p_end       date,
  p_fixed     boolean,
  p_staff_id  uuid    DEFAULT NULL::uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

ALTER TABLE "public"."patterns"
  ADD CONSTRAINT "patterns_pair_pattern_id_tenant_id_fkey" FOREIGN KEY (pair_pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE SET NULL (pair_pattern_id);

ALTER TABLE "public"."profiles"
  ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE "public"."plan_change_logs"
  ADD CONSTRAINT "plan_change_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE "public"."required_nums"
  ADD CONSTRAINT "required_nums_pattern_id_tenant_id_fkey" FOREIGN KEY (pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_check1" CHECK (((days >= 1) AND (days <=
CASE
    WHEN (kind = 'max_weekend_days'::public.restriction_kind) THEN 15
    ELSE 7
END)));

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_check" CHECK (((kind <> 'prefer_dayoff_wdays'::public.restriction_kind) OR (NOT hard)));

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_pattern1_id_tenant_id_fkey" FOREIGN KEY (pattern1_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_pattern2_id_tenant_id_fkey" FOREIGN KEY (pattern2_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."shifts"
  ADD CONSTRAINT "shifts_assist_run_id_tenant_id_fkey" FOREIGN KEY (assist_run_id, tenant_id) REFERENCES public.assist_runs(id, tenant_id) ON DELETE SET NULL (assist_run_id);

ALTER TABLE "public"."shifts"
  ADD CONSTRAINT "shifts_pattern_id_tenant_id_fkey" FOREIGN KEY (pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_default_patterns"
  ADD CONSTRAINT "staff_default_patterns_pattern_id_tenant_id_fkey" FOREIGN KEY (pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_patterns"
  ADD CONSTRAINT "staff_patterns_pattern_id_tenant_id_fkey" FOREIGN KEY (pattern_id, tenant_id) REFERENCES public.patterns(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_staff_id_tenant_id_fkey" FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staffs(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."shifts"
  ADD CONSTRAINT "shifts_staff_id_tenant_id_fkey" FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staffs(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_default_patterns"
  ADD CONSTRAINT "staff_default_patterns_staff_id_tenant_id_fkey" FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staffs(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_patterns"
  ADD CONSTRAINT "staff_patterns_staff_id_tenant_id_fkey" FOREIGN KEY (staff_id, tenant_id) REFERENCES public.staffs(id, tenant_id) ON DELETE CASCADE;

ALTER TABLE "public"."assist_runs"
  ADD CONSTRAINT "assist_runs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."date_notes"
  ADD CONSTRAINT "date_notes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."patterns"
  ADD CONSTRAINT "patterns_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."required_nums"
  ADD CONSTRAINT "required_nums_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."restrictions"
  ADD CONSTRAINT "restrictions_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."shares"
  ADD CONSTRAINT "shares_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."shifts"
  ADD CONSTRAINT "shifts_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_default_patterns"
  ADD CONSTRAINT "staff_default_patterns_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."staff_patterns"
  ADD CONSTRAINT "staff_patterns_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

ALTER TABLE "public"."staffs"
  ADD CONSTRAINT "staffs_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX assist_runs_one_running_idx ON public.assist_runs USING btree (tenant_id)
  WHERE (status = 'running'::public.assist_run_status);

CREATE INDEX assist_runs_tenant_created_idx ON public.assist_runs USING btree (tenant_id, created_at DESC);

CREATE INDEX patterns_pair_pattern_id_idx ON public.patterns USING btree (pair_pattern_id);

CREATE INDEX patterns_tenant_position_idx ON public.patterns USING btree (tenant_id, "position");

CREATE INDEX plan_change_logs_user_created_idx ON public.plan_change_logs USING btree (user_id, created_at DESC);

CREATE INDEX required_nums_tenant_date_idx ON public.required_nums USING btree (tenant_id, date);

CREATE INDEX restrictions_pattern1_id_idx ON public.restrictions USING btree (pattern1_id);

CREATE INDEX restrictions_pattern2_id_idx ON public.restrictions USING btree (pattern2_id);

CREATE INDEX restrictions_staff_id_idx ON public.restrictions USING btree (staff_id);

CREATE INDEX restrictions_tenant_position_idx ON public.restrictions USING btree (tenant_id, "position");

CREATE INDEX shares_tenant_created_idx ON public.shares USING btree (tenant_id, created_at DESC);

CREATE INDEX shifts_assist_run_id_idx ON public.shifts USING btree (assist_run_id);

CREATE INDEX shifts_pattern_id_idx ON public.shifts USING btree (pattern_id);

CREATE INDEX shifts_tenant_date_staff_idx ON public.shifts USING btree (tenant_id, date, staff_id);

CREATE INDEX staff_default_patterns_pattern_id_idx ON public.staff_default_patterns USING btree (pattern_id);

CREATE INDEX staff_default_patterns_tenant_id_idx ON public.staff_default_patterns USING btree (tenant_id);

CREATE INDEX staff_patterns_pattern_id_idx ON public.staff_patterns USING btree (pattern_id);

CREATE INDEX staff_patterns_tenant_id_idx ON public.staff_patterns USING btree (tenant_id);

CREATE INDEX staffs_tenant_active_position_idx ON public.staffs USING btree (tenant_id, "position")
  WHERE (retired_at IS NULL);

CREATE INDEX staffs_tenant_position_idx ON public.staffs USING btree (tenant_id, "position");

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_new_user();

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (((old.email)::text IS DISTINCT FROM (new.email)::text))
  EXECUTE FUNCTION private.sync_profile_email();

CREATE TRIGGER assist_runs_set_updated_at
  BEFORE UPDATE ON public.assist_runs
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER date_notes_set_updated_at
  BEFORE UPDATE ON public.date_notes
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER patterns_set_updated_at
  BEFORE UPDATE ON public.patterns
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER restrictions_set_updated_at
  BEFORE UPDATE ON public.restrictions
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER shifts_set_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER staffs_set_updated_at
  BEFORE UPDATE ON public.staffs
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE TRIGGER tenants_set_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION private.set_updated_at();

CREATE POLICY "assist_runs_member_all" ON "public"."assist_runs"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "assist_runs_restrict_same_tenant" ON "public"."assist_runs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "date_notes_member_all" ON "public"."date_notes"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "date_notes_restrict_same_tenant" ON "public"."date_notes"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "patterns_member_all" ON "public"."patterns"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "patterns_restrict_same_tenant" ON "public"."patterns"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "plan_change_logs_select_own" ON "public"."plan_change_logs"
  FOR SELECT
  TO "authenticated"
  USING ((user_id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "profiles_select_own" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((id = ( SELECT auth.uid() AS uid)));

CREATE POLICY "required_nums_member_all" ON "public"."required_nums"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "required_nums_restrict_same_tenant" ON "public"."required_nums"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "restrictions_member_all" ON "public"."restrictions"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "restrictions_restrict_same_tenant" ON "public"."restrictions"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "shares_member_all" ON "public"."shares"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "shares_restrict_same_tenant" ON "public"."shares"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "shifts_member_all" ON "public"."shifts"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "shifts_restrict_same_tenant" ON "public"."shifts"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "staff_default_patterns_member_all" ON "public"."staff_default_patterns"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_default_patterns_restrict_same_tenant" ON "public"."staff_default_patterns"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "staff_patterns_member_all" ON "public"."staff_patterns"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_patterns_restrict_same_tenant" ON "public"."staff_patterns"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

CREATE POLICY "staffs_member_all" ON "public"."staffs"
  FOR ALL
  TO "authenticated"
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staffs_restrict_same_tenant" ON "public"."staffs"
  AS RESTRICTIVE
  FOR ALL
  TO "authenticated"
  USING ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)))
  WITH CHECK ((tenant_id IN ( SELECT private.owned_tenant_ids() AS owned_tenant_ids)));

GRANT EXECUTE ON FUNCTION "private"."handle_new_user"() TO "postgres";

REVOKE ALL ON FUNCTION "private"."owned_tenant_ids"() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "private"."owned_tenant_ids"() TO "authenticated", "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_updated_at"() TO "postgres";

GRANT EXECUTE ON FUNCTION "private"."sync_profile_email"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."assign_shift"(uuid, uuid, date, boolean, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."clear_draft_shifts"(uuid, date, date, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."copy_shifts"(uuid, date, date, date, uuid[]) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."reorder_positions"(text, uuid, uuid[]) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."rollback_assist_run"(uuid, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION "public"."set_shifts_fixed"(uuid, date, date, boolean, uuid) TO "anon", "authenticated", "postgres", "service_role";

GRANT CREATE, USAGE ON SCHEMA "private" TO "postgres";

REVOKE ALL ON TABLE "public"."assist_runs" FROM "authenticated";

GRANT INSERT, SELECT, UPDATE ON TABLE "public"."assist_runs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."assist_runs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."date_notes" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."date_notes" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."date_notes" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."patterns" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."patterns" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."patterns" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."plan_change_logs" FROM "authenticated";

GRANT SELECT ON TABLE "public"."plan_change_logs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."plan_change_logs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT SELECT ON TABLE "public"."profiles" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."required_nums" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."required_nums" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."required_nums" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."restrictions" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."restrictions" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."restrictions" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."shares" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."shares" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shares" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."shifts" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."shifts" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shifts" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."staff_default_patterns" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."staff_default_patterns" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_default_patterns" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."staff_patterns" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."staff_patterns" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staff_patterns" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."staffs" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."staffs" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."staffs" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."tenants" FROM "authenticated";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."tenants" TO "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tenants" TO "postgres", "service_role";

GRANT USAGE ON TYPE "public"."assist_run_status" TO "postgres";

GRANT USAGE ON TYPE "public"."pattern_kind" TO "postgres";

GRANT USAGE ON TYPE "public"."restriction_kind" TO "postgres";

GRANT USAGE ON TYPE "public"."shift_cycle" TO "postgres";

ALTER TABLE "public"."tenants"
  ADD CONSTRAINT "tenants_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

CREATE INDEX tenants_owner_id_idx ON public.tenants USING btree (owner_id);

CREATE POLICY "tenants_owner_all" ON "public"."tenants"
  FOR ALL
  TO "authenticated"
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));
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
--   declarative sync をやり直したら、生成された migration の末尾にこのファイルを追記する。
--     cat supabase/unmanaged/restrict_anon_grants.sql >> supabase/migrations/<ts>_init_schema.sql
--   追記を忘れると npx supabase test db の「anon は ... を読めない」が落ちる。
--
-- RLS だけでも anon は 0 行しか読めないが、TRUNCATE は RLS を通らないので権限の層で閉じる。
-- 公開共有ページ（/share/[code]）は anon ではなく createPrivilegedClient()（service_role）で読む。

REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM "anon";
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM "anon";
