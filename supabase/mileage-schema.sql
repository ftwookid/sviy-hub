create table if not exists mileage_uploads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null,
  period_start date not null,
  period_end date not null,
  source_filename text,
  source_hash text not null,
  source_csv text not null,
  is_complete boolean not null default false,
  is_active boolean not null default false,
  business_trip_count integer not null default 0,
  business_miles decimal(12,2) not null default 0,
  deduction_value decimal(12,2) not null default 0
);

create table if not exists mileage_trips (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  upload_id uuid not null references mileage_uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamp not null,
  end_at timestamp,
  start_location text not null default '',
  stop_location text not null default '',
  rate decimal(8,4) not null,
  miles decimal(10,2) not null,
  deduction_value decimal(12,2) not null,
  vehicle text,
  purpose text,
  notes text
);

alter table mileage_uploads enable row level security;
alter table mileage_trips enable row level security;

drop policy if exists "Users and admins can manage mileage uploads" on mileage_uploads;
create policy "Users and admins can manage mileage uploads"
  on mileage_uploads for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage mileage trips" on mileage_trips;
create policy "Users and admins can manage mileage trips"
  on mileage_trips for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

create unique index if not exists mileage_uploads_user_hash_idx
  on mileage_uploads (user_id, source_hash);
create unique index if not exists mileage_uploads_active_month_idx
  on mileage_uploads (user_id, period_month)
  where is_active;
create index if not exists mileage_uploads_user_month_idx
  on mileage_uploads (user_id, period_month desc, created_at desc);
create index if not exists mileage_trips_user_start_idx
  on mileage_trips (user_id, start_at desc);
create index if not exists mileage_trips_upload_idx
  on mileage_trips (upload_id);
