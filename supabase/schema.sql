create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('admin', 'user')),
  nickname text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles add column if not exists nickname text;

alter table profiles enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user_profile();

drop policy if exists "Users can view their own profile" on profiles;
create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id or is_admin());

drop policy if exists "Users can create their own user profile" on profiles;
create policy "Users can create their own user profile"
  on profiles for insert
  with check (auth.uid() = id and role = 'user');

drop policy if exists "Users can update their own profile" on profiles;
create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');

drop policy if exists "Admins can manage profiles" on profiles;
create policy "Admins can manage profiles"
  on profiles for all
  using (is_admin())
  with check (is_admin());

-- Existing user nickname setup. Run this in Supabase SQL Editor after replacing
-- or confirming these email addresses match the auth users.
update profiles
set nickname = 'Ivan K. (Admin)',
    updated_at = now()
where id = (
  select id
  from auth.users
  where email = 'ftwookid@gmail.com'
);

update profiles
set nickname = 'Yani',
    updated_at = now()
where id = (
  select id
  from auth.users
  where email = 'yanakoshelna@gmail.com'
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  date date not null,
  merchant text not null,
  description text,
  amount decimal(10,2) not null,
  category text not null,
  payment_method text not null default 'Main card',
  receipt_url text,
  receipt_filename text,
  notes text,
  user_id uuid references auth.users(id) on delete cascade
);

alter table expenses enable row level security;

drop policy if exists "Users can manage their own expenses" on expenses;
drop policy if exists "Users and admins can manage expenses" on expenses;
create policy "Users and admins can manage expenses"
  on expenses for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

create index if not exists expenses_user_date_idx on expenses (user_id, date desc);
create index if not exists expenses_user_category_idx on expenses (user_id, category);

-- Admin-aware policies for client tables. This block is safe to run before or after
-- supabase/clients-schema.sql because it only applies policies when the tables exist.
do $$
begin
  if to_regclass('public.clients') is not null then
    execute 'drop policy if exists "Users can manage their own clients" on clients';
    execute 'drop policy if exists "Users and admins can manage clients" on clients';
    execute 'create policy "Users and admins can manage clients"
      on clients for all
      using (auth.uid() = user_id or is_admin())
      with check (auth.uid() = user_id or is_admin())';
  end if;

  if to_regclass('public.pets') is not null then
    execute 'drop policy if exists "Users can manage their own pets" on pets';
    execute 'drop policy if exists "Users and admins can manage pets" on pets';
    execute 'create policy "Users and admins can manage pets"
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
      )';
  end if;

  if to_regclass('public.status_history') is not null then
    execute 'drop policy if exists "Users and admins can manage status history" on status_history';
    execute 'drop policy if exists "Users and admins can insert status history" on status_history';
    execute 'create policy "Users and admins can manage status history"
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
      )';
  end if;

  if to_regclass('public.price_history') is not null then
    execute 'drop policy if exists "Users and admins can manage price history" on price_history';
    execute 'create policy "Users and admins can manage price history"
      on price_history for all
      using (
        exists (
          select 1
          from clients
          where clients.id = price_history.client_id
            and (clients.user_id = auth.uid() or is_admin())
        )
      )
      with check (
        exists (
          select 1
          from clients
          where clients.id = price_history.client_id
            and (clients.user_id = auth.uid() or is_admin())
        )
      )';
  end if;
end;
$$;

-- In Supabase Storage, create a private bucket named "receipts".
-- Recommended Storage policies for the private receipts bucket:
--
-- create policy "Users can upload their own receipts"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can view their own receipts"
--   on storage.objects for select
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can update their own receipts"
--   on storage.objects for update
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can delete their own receipts"
--   on storage.objects for delete
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
