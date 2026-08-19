-- Health: one row per person per reading day.
--
-- The books are shared, but a body is not a household total — every figure here
-- belongs to exactly one person, so `person_id` is the axis the whole section
-- pivots on rather than the "who logged this" attribution `user_id` carries
-- elsewhere. `logged_by` keeps that attribution separately, for the case where
-- one person types in the other's weigh-in.

create table if not exists health_profiles (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users(id) on delete cascade,
  height_in decimal(5,2),
  birth_date date,
  goal_weight_lb decimal(6,2),
  goal_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists health_entries (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references auth.users(id) on delete cascade,
  logged_by uuid references auth.users(id) on delete set null,
  recorded_on date not null,
  weight_lb decimal(6,2),
  body_fat_pct decimal(5,2),
  waist_in decimal(5,2),
  chest_in decimal(5,2),
  hips_in decimal(5,2),
  arm_in decimal(5,2),
  thigh_in decimal(5,2),
  note text,
  created_at timestamptz not null default now()
);

-- One profile per person, and one reading per person per day: weighing twice
-- before breakfast is noise, and two rows for one morning would make every
-- trend line depend on which of them sorted first.
create unique index if not exists health_profiles_person_idx on health_profiles (person_id);
create unique index if not exists health_entries_person_day_idx on health_entries (person_id, recorded_on);
create index if not exists health_entries_person_date_idx on health_entries (person_id, recorded_on desc);

alter table health_profiles enable row level security;
alter table health_entries enable row level security;

drop policy if exists "Shared workspace" on health_profiles;
create policy "Shared workspace" on health_profiles
  for all to authenticated
  using (true) with check (true);

drop policy if exists "Shared workspace" on health_entries;
create policy "Shared workspace" on health_entries
  for all to authenticated
  using (true) with check (true);
