-- シフト表の表示期間（v1 Tenant#shift_cycle）
create type public.shift_cycle as enum ('month', 'half_month', 'two_week', 'week');

-- 勤務パターンの種別（v1 Pattern#kind の 0 = 勤務 / 1 = 休み）
create type public.pattern_kind as enum ('workday', 'dayoff');

-- 自動アサイン制約の種別（v1 Restriction::KINDS）
create type public.restriction_kind as enum (
  'deny_pattern_pair',
  'max_work_week',
  'max_work_consecutive',
  'sat_or_sun_dayoff'
);
