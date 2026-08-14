-- Sviy Hub — Expenses redesign schema.
-- Safe to run more than once. Extends the existing `expenses` table from schema.sql
-- with proof tracking, parking batches, and Google Drive archival.

-- ---------------------------------------------------------------------------
-- Receipts (proof of transaction)
--
-- A receipt is its own record because one bank-statement screenshot can prove
-- many parking transactions. Standard expenses link 1:1; parking batches link
-- many expenses to a single screenshot.
--
-- Supabase Storage is the working copy; Google Drive is the permanent archive.
-- Once drive_file_id is set and drive_synced_at is stamped, the Supabase object
-- is disposable and may be pruned.
-- ---------------------------------------------------------------------------
create table if not exists receipts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,

  filename text not null,
  mime_type text not null default 'image/jpeg',
  byte_size integer not null default 0 check (byte_size >= 0),

  -- Supabase Storage object path in the private `receipts` bucket.
  -- Null once the local copy has been pruned after a verified Drive sync.
  storage_path text,

  -- Google Drive archive
  drive_file_id text,
  drive_link text,
  drive_synced_at timestamptz,
  drive_error text,

  -- The month this receipt is filed under (always the first of the month).
  -- Drives the year/Invoices/month folder placement in Drive.
  period_month date not null,

  pruned_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Parking batches
--
-- One uploaded bank-statement screenshot that the vision scan turns into many
-- parking transactions. Kept as a record so a batch can be reviewed or undone
-- as a unit.
-- ---------------------------------------------------------------------------
create table if not exists expense_batches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  receipt_id uuid references receipts(id) on delete set null,

  source text not null default 'Parking' check (source in ('Parking', 'Standard')),
  status text not null default 'Draft' check (status in ('Draft', 'Confirmed', 'Discarded')),

  -- Raw model output kept for auditing what the scan proposed vs what was saved.
  scanned_rows jsonb not null default '[]'::jsonb,
  scan_note text,
  confirmed_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Monthly close-out
--
-- Yana works one month at a time, in arrears. A closeout row records that a
-- month has been reviewed and every transaction has proof (or an explicit waiver).
-- ---------------------------------------------------------------------------
create table if not exists expense_month_closeouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_month date not null,
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  closed_at timestamptz,
  note text,
  unique (user_id, period_month)
);

-- ---------------------------------------------------------------------------
-- Google Drive connection
--
-- Holds the OAuth refresh token and the folder the user picked. Never exposed
-- to the browser: RLS grants nothing, so only the service role (server-side
-- API routes) can read or write it.
-- ---------------------------------------------------------------------------
create table if not exists google_drive_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,

  google_email text,
  root_folder_id text,
  root_folder_name text,

  last_sync_at timestamptz,
  last_sync_error text
);

-- ---------------------------------------------------------------------------
-- Expenses table extensions
-- ---------------------------------------------------------------------------
alter table expenses add column if not exists expense_type text not null default 'Standard';
alter table expenses add column if not exists receipt_id uuid references receipts(id) on delete set null;
alter table expenses add column if not exists batch_id uuid references expense_batches(id) on delete set null;
alter table expenses add column if not exists proof_waived boolean not null default false;
alter table expenses add column if not exists proof_note text;
alter table expenses add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_expense_type_check') then
    alter table expenses
      add constraint expenses_expense_type_check check (expense_type in ('Standard', 'Parking'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table receipts enable row level security;
alter table expense_batches enable row level security;
alter table expense_month_closeouts enable row level security;
alter table google_drive_accounts enable row level security;

drop policy if exists "Users and admins can manage receipts" on receipts;
create policy "Users and admins can manage receipts"
  on receipts for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage expense batches" on expense_batches;
create policy "Users and admins can manage expense batches"
  on expense_batches for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage expense closeouts" on expense_month_closeouts;
create policy "Users and admins can manage expense closeouts"
  on expense_month_closeouts for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

-- google_drive_accounts intentionally has NO policy. RLS is on and nothing is
-- granted, so the table is unreachable with the anon/authenticated key. Only
-- server-side routes using SUPABASE_SERVICE_ROLE_KEY can touch refresh tokens.
drop policy if exists "Users can manage their drive account" on google_drive_accounts;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists receipts_user_period_idx on receipts (user_id, period_month desc);
create index if not exists receipts_drive_pending_idx on receipts (user_id) where drive_file_id is null;
create index if not exists receipts_prunable_idx on receipts (drive_synced_at) where storage_path is not null;
create index if not exists expense_batches_user_idx on expense_batches (user_id, created_at desc);
create index if not exists expense_closeouts_user_period_idx on expense_month_closeouts (user_id, period_month desc);
create index if not exists expenses_receipt_idx on expenses (receipt_id);
create index if not exists expenses_batch_idx on expenses (batch_id);
create index if not exists expenses_user_type_date_idx on expenses (user_id, expense_type, date desc);
-- Drives the "what is missing proof" view.
create index if not exists expenses_missing_proof_idx on expenses (user_id, date desc)
  where receipt_id is null and proof_waived = false;

-- ---------------------------------------------------------------------------
-- Backfill: carry legacy single-receipt uploads into the receipts table so no
-- existing proof is lost. Runs once; re-running is a no-op.
-- ---------------------------------------------------------------------------
do $$
declare
  legacy record;
  new_receipt_id uuid;
begin
  for legacy in
    select id, user_id, date, receipt_url, receipt_filename
    from expenses
    where receipt_url is not null
      and receipt_id is null
      and user_id is not null
  loop
    insert into receipts (user_id, filename, storage_path, period_month, mime_type)
    values (
      legacy.user_id,
      coalesce(legacy.receipt_filename, 'receipt'),
      legacy.receipt_url,
      date_trunc('month', legacy.date)::date,
      'application/octet-stream'
    )
    returning id into new_receipt_id;

    update expenses set receipt_id = new_receipt_id where id = legacy.id;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage bucket
--
-- The private `receipts` bucket from schema.sql is reused unchanged. Objects are
-- stored at {user_id}/{year}/{month}/{filename}, so the existing owner-scoped
-- storage policies keyed on (storage.foldername(name))[1] still apply.
-- ---------------------------------------------------------------------------
