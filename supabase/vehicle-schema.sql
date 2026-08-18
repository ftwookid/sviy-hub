-- Running costs for the car the business miles are driven in.
-- Nothing here is a deduction; it exists to answer whether the car earns its keep.

create table if not exists vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Car',
  mpg decimal(6,2),
  fuel_price decimal(6,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists vehicle_costs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  incurred_on date not null,
  kind text not null default 'Other',
  amount decimal(10,2) not null,
  note text,
  created_at timestamptz not null default now()
);

alter table vehicle_costs
  drop constraint if exists vehicle_costs_kind_check;
alter table vehicle_costs
  add constraint vehicle_costs_kind_check
  check (kind in ('Fuel', 'Maintenance', 'Repair', 'Insurance', 'Registration', 'Payment', 'Other'));

-- One car per person. The question is about the car being driven now, not a fleet.
create unique index if not exists vehicle_profiles_user_idx on vehicle_profiles (user_id);
create index if not exists vehicle_costs_user_date_idx on vehicle_costs (user_id, incurred_on desc);

alter table vehicle_profiles enable row level security;
alter table vehicle_costs enable row level security;

drop policy if exists "Users and admins can manage vehicle profiles" on vehicle_profiles;
create policy "Users and admins can manage vehicle profiles"
  on vehicle_profiles for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage vehicle costs" on vehicle_costs;
create policy "Users and admins can manage vehicle costs"
  on vehicle_costs for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());
