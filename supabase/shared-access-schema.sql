-- Shared books.
--
-- The app used to split every table by owner: you saw your own rows, an admin
-- saw everyone's. For a two-person business keeping one set of books that was
-- backwards — the year's totals are a household number, and half of it being
-- invisible to the person who earned it made the app worse at its only job.
--
-- Now: anyone signed in reads and writes everything. `user_id` stays on every
-- row and is still stamped on insert — it is what tells you who logged what,
-- which is navigation, not permission.
--
-- What stays restricted: `profiles.role`, so nobody can promote themselves, and
-- `google_drive_accounts`, which holds OAuth tokens and has no policy at all
-- (service role only). Re-runnable.

do $$
declare
  shared_tables text[] := array[
    'expenses',
    'receipts',
    'expense_batches',
    'expense_month_closeouts',
    'clients',
    'pets',
    'status_history',
    'price_history',
    'house_sittings',
    'house_sitting_customers',
    'mileage_uploads',
    'mileage_trips',
    'statement_imports',
    'statement_import_rows',
    'payment_cards',
    'vehicle_profiles',
    'vehicle_costs'
  ];
  target text;
  existing text;
begin
  foreach target in array shared_tables loop
    -- A table may not exist yet: the migrations that create them are run in
    -- whatever order suits, and this one must not care.
    if to_regclass(format('public.%I', target)) is null then
      raise notice 'skipping %, table does not exist yet', target;
      continue;
    end if;

    -- Dropped by lookup rather than by name. These tables have carried several
    -- policy names over time, and a leftover owner-scoped policy would not
    -- block anything (policies OR together) but would be a lie about who can
    -- see what the next time someone reads the schema.
    for existing in
      select policyname from pg_policies where schemaname = 'public' and tablename = target
    loop
      execute format('drop policy %I on public.%I', existing, target);
    end loop;

    execute format('alter table public.%I enable row level security', target);
    execute format(
      'create policy "Shared workspace" on public.%I for all to authenticated using (true) with check (true)',
      target
    );
  end loop;
end $$;

-- Merchant memory stays personal, and is the one table that does not move.
-- It is not a record of anything — it is a replay of one person's judgement
-- calls onto next month's statement. Sharing the books does not make Ivan's
-- sense of what counts as business the right default for Yana's review screen.
-- (It never was admin-wide either, so this is unchanged, stated on purpose.)
drop policy if exists "Users can manage their merchant rules" on merchant_rules;
create policy "Users can manage their merchant rules"
  on merchant_rules for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Profiles: readable by everyone, because that is where the nicknames on owner
-- labels come from. Role is the one field that stays privileged.
drop policy if exists "Users can view their own profile" on profiles;
drop policy if exists "Anyone signed in can read profiles" on profiles;
drop policy if exists "Users can create their own user profile" on profiles;
drop policy if exists "Users can update their own profile" on profiles;
drop policy if exists "Admins can manage profiles" on profiles;

create policy "Anyone signed in can read profiles"
  on profiles for select
  to authenticated
  using (true);

create policy "Users can create their own user profile"
  on profiles for insert
  to authenticated
  with check (auth.uid() = id and role = 'user');

-- `role = 'user'` is what stops a regular user editing their nickname and
-- quietly promoting themselves in the same update. Admins are unaffected: the
-- admin policy below is permissive and ORs with this one.
create policy "Users can update their own profile"
  on profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = 'user');

create policy "Admins can manage profiles"
  on profiles for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- Storage. Receipts and pet photos are filed under "{user_id}/..." and stay
-- that way — the path is a record of who uploaded it. It just stops being a
-- fence.
drop policy if exists "Users can upload their own pet photos" on storage.objects;
drop policy if exists "Users can view their own pet photos" on storage.objects;
drop policy if exists "Users can update their own pet photos" on storage.objects;
drop policy if exists "Users can delete their own pet photos" on storage.objects;
drop policy if exists "Users can upload their own receipts" on storage.objects;
drop policy if exists "Users can view their own receipts" on storage.objects;
drop policy if exists "Users can update their own receipts" on storage.objects;
drop policy if exists "Users can delete their own receipts" on storage.objects;
drop policy if exists "Shared workspace can read files" on storage.objects;
drop policy if exists "Shared workspace can write files" on storage.objects;
drop policy if exists "Shared workspace can update files" on storage.objects;
drop policy if exists "Shared workspace can delete files" on storage.objects;

create policy "Shared workspace can read files"
  on storage.objects for select
  to authenticated
  using (bucket_id in ('pet-photos', 'receipts'));

create policy "Shared workspace can write files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id in ('pet-photos', 'receipts'));

create policy "Shared workspace can update files"
  on storage.objects for update
  to authenticated
  using (bucket_id in ('pet-photos', 'receipts'))
  with check (bucket_id in ('pet-photos', 'receipts'));

create policy "Shared workspace can delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id in ('pet-photos', 'receipts'));
