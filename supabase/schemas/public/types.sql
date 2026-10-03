-- シフト表の表示期間（v1 Tenant#shift_cycle）
create type public.shift_cycle as enum ('month', 'half_month', 'two_week', 'week');

-- 勤務パターンの種別（v1 Pattern#kind の 0 = 勤務 / 1 = 休み）
create type public.pattern_kind as enum ('workday', 'dayoff');

-- 自動アサイン制約の種別。上の 4 つは v1 Restriction::KINDS、下の 3 つは 013 で追加
-- （店長の指示の min_workdays / limit_weekends / prefer_off と 1:1。013 §3.3）
create type public.restriction_kind as enum (
  'deny_pattern_pair',
  'max_work_week',
  'max_work_consecutive',
  'sat_or_sun_dayoff',
  'min_work_week',
  'max_weekend_days',
  'prefer_dayoff_wdays'
);

-- 自動アサインの実行状態（012 §5.8）
create type public.assist_run_status as enum ('running', 'succeeded', 'failed');
