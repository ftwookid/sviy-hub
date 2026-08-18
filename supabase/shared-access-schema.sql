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
    'merchant_rules',
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

-- Merchant memory is shared too. One household, one business, one answer to
-- "is Chewy a business expense" — teaching it once should hold for whoever
-- reviews next month's statement.
--
-- That makes the key the merchant, not the merchant-and-person, so the
-- duplicates that the old per-user key allowed are collapsed first: the most
-- recently updated rule for each fingerprint wins, since it is the most recent
-- decision anyone made about that merchant.
delete from merchant_rules a
using merchant_rules b
where a.match_key = b.match_key
  and (a.updated_at, a.id) < (b.updated_at, b.id);

alter table merchant_rules drop constraint if exists merchant_rules_user_id_match_key_key;
drop index if exists merchant_rules_match_key_idx;
create unique index merchant_rules_match_key_idx on merchant_rules (match_key);

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
