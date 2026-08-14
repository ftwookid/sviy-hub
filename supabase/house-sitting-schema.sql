create table if not exists house_sitting_customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  pet_names text not null default '',
  pets jsonb not null default '[]'::jsonb
);

create table if not exists house_sittings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_id uuid references house_sitting_customers(id) on delete set null,
  regular_client_id uuid references clients(id) on delete set null,
  customer_name text not null,
  address text not null default '',
  pet_names text not null default '',
  pets jsonb not null default '[]'::jsonb,
  payment_method text not null default 'Rover' check (payment_method in ('Rover', 'Venmo', 'Cash')),
  start_date date not null,
  end_date date not null,
  nightly_rate decimal(10,2) not null default 0 check (nightly_rate >= 0),
  rover_commission_rate decimal(4,3) not null default 0.20,
  status text not null default 'Planned' check (status in ('Planned', 'Cancelled')),
  notes text,
  constraint house_sittings_valid_dates check (end_date >= start_date)
);

alter table house_sitting_customers add column if not exists pets jsonb not null default '[]'::jsonb;
alter table house_sittings add column if not exists pets jsonb not null default '[]'::jsonb;
alter table house_sittings add column if not exists status text not null default 'Planned';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'house_sittings_status_check'
  ) then
    alter table house_sittings
      add constraint house_sittings_status_check check (status in ('Planned', 'Cancelled'));
  end if;
end $$;

alter table house_sitting_customers enable row level security;
alter table house_sittings enable row level security;

drop policy if exists "Users and admins can manage house sitting customers" on house_sitting_customers;
create policy "Users and admins can manage house sitting customers"
  on house_sitting_customers for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage house sittings" on house_sittings;
create policy "Users and admins can manage house sittings"
  on house_sittings for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

create index if not exists house_sitting_customers_user_name_idx on house_sitting_customers (user_id, name);
create index if not exists house_sittings_user_start_idx on house_sittings (user_id, start_date desc);
create index if not exists house_sittings_date_range_idx on house_sittings (start_date, end_date);
create index if not exists house_sittings_status_idx on house_sittings (status);
create index if not exists house_sittings_customer_idx on house_sittings (customer_id);
create index if not exists house_sittings_regular_client_idx on house_sittings (regular_client_id);
