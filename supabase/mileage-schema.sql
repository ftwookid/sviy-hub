create table if not exists mileage_uploads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null,
  original_filename text not null,
  content_hash text not null,
  raw_csv text not null,
  coverage_start date not null,
  coverage_end date not null,
  is_complete boolean not null default false,
  is_active boolean not null default false,
  business_trip_count integer not null default 0,
  business_miles decimal(12,3) not null default 0,
  deduction_value decimal(12,2) not null default 0,
  uploaded_at timestamptz not null default now(),
  activated_at timestamptz
);

create table if not exists mileage_trips (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null references mileage_uploads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  start_at timestamp not null,
  end_at timestamp,
  start_location text,
  stop_location text,
  rate decimal(8,4) not null,
  miles decimal(10,3) not null,
  deduction_value decimal(10,2) not null,
  vehicle text,
  purpose text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists mileage_uploads_user_hash_idx
  on mileage_uploads (user_id, content_hash);
create unique index if not exists mileage_uploads_one_active_month_idx
  on mileage_uploads (user_id, period_month)
  where is_active;
create index if not exists mileage_uploads_user_month_idx
  on mileage_uploads (user_id, period_month desc, uploaded_at desc);
create index if not exists mileage_trips_user_start_idx
  on mileage_trips (user_id, start_at desc);
create index if not exists mileage_trips_upload_idx
  on mileage_trips (upload_id);

alter table mileage_uploads enable row level security;
alter table mileage_trips enable row level security;

drop policy if exists "Users and admins can manage mileage uploads" on mileage_uploads;
drop policy if exists "Users can manage their own mileage uploads" on mileage_uploads;
create policy "Users can manage their own mileage uploads"
  on mileage_uploads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users and admins can manage mileage trips" on mileage_trips;
drop policy if exists "Users can manage their own mileage trips" on mileage_trips;
create policy "Users can manage their own mileage trips"
  on mileage_trips for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keep user_id aligned with the immutable parent upload.
create or replace function validate_mileage_trip_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from mileage_uploads
    where id = new.upload_id and user_id = new.user_id
  ) then
    raise exception 'Mileage trip owner must match upload owner';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_mileage_trip_owner_trigger on mileage_trips;
create trigger validate_mileage_trip_owner_trigger
  before insert or update on mileage_trips
  for each row execute function validate_mileage_trip_owner();
