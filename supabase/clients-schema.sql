create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  address text not null default '',
  payment_method text not null default 'Rover' check (payment_method in ('Rover', 'Venmo', 'Cash')),
  status text not null default 'Active' check (status in ('Active', 'Paused')),
  service_type text not null default 'Dog walking',
  custom_service_type text,
  price_per_visit decimal(10,2) not null default 0,
  frequency_label text not null default '',
  visits_per_week decimal(6,2),
  notes text,
  rover_commission_rate decimal(4,3) not null default 0.20
);

create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  client_id uuid not null references clients(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'Dog' check (type in ('Dog', 'Cat', 'Bird', 'Exotic')),
  photo_url text,
  photo_filename text
);

create table if not exists status_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  status text not null check (status in ('Active', 'Paused')),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now()
);

alter table clients enable row level security;
alter table pets enable row level security;
alter table status_history enable row level security;

drop policy if exists "Users can manage their own clients" on clients;
drop policy if exists "Users and admins can manage clients" on clients;
create policy "Users and admins can manage clients"
  on clients for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users can manage their own pets" on pets;
drop policy if exists "Users and admins can manage pets" on pets;
create policy "Users and admins can manage pets"
  on pets for all
  using (
    is_admin()
    or exists (
      select 1
      from clients
      where clients.id = pets.client_id
        and clients.user_id = auth.uid()
    )
  )
  with check (
    is_admin()
    or exists (
      select 1
      from clients
      where clients.id = pets.client_id
        and clients.user_id = auth.uid()
    )
  );

drop policy if exists "Users and admins can manage status history" on status_history;
drop policy if exists "Users and admins can insert status history" on status_history;
create policy "Users and admins can manage status history"
  on status_history for all
  using (
    exists (
      select 1
      from clients
      where clients.id = status_history.client_id
        and (clients.user_id = auth.uid() or is_admin())
    )
  )
  with check (
    exists (
      select 1
      from clients
      where clients.id = status_history.client_id
        and (clients.user_id = auth.uid() or is_admin())
    )
  );

create index if not exists clients_user_status_idx on clients (user_id, status);
create index if not exists clients_user_name_idx on clients (user_id, name);
create index if not exists pets_client_idx on pets (client_id);
create index if not exists pets_user_idx on pets (user_id);
create index if not exists status_history_client_start_idx on status_history (client_id, start_date desc);
create index if not exists status_history_client_current_idx on status_history (client_id) where end_date is null;

-- In Supabase Storage, create a private bucket named "pet-photos".
-- Pet photo paths are stored as "{user_id}/pets/{filename}".
drop policy if exists "Users can upload their own pet photos" on storage.objects;
drop policy if exists "Users can view their own pet photos" on storage.objects;
drop policy if exists "Users can update their own pet photos" on storage.objects;
drop policy if exists "Users can delete their own pet photos" on storage.objects;

create policy "Users can upload their own pet photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'pet-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can view their own pet photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can update their own pet photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'pet-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own pet photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'pet-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
