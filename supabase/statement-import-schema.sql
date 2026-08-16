-- Sviy Hub — Bank statement import schema.
-- Safe to run more than once.
--
-- The flow this backs:
--   1. Drop a statement PDF  -> `statement_imports` row (status Parsing)
--   2. Claude extracts rows  -> `statement_import_rows` (one per transaction)
--   3. The user reviews      -> each row is Include / Flag / Exclude, edited in place
--   4. Confirm               -> Included rows become `expenses`, and the user's
--                               choices are remembered in `merchant_rules`
--
-- Rows live in their own table (not a jsonb blob) so a half-finished review
-- survives a refresh, a phone lock, or a different device.

-- ---------------------------------------------------------------------------
-- One uploaded statement
-- ---------------------------------------------------------------------------
create table if not exists statement_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,

  filename text not null,
  byte_size integer not null default 0 check (byte_size >= 0),
  -- Object path in the private `receipts` bucket. The statement itself is proof
  -- worth keeping, but it is not a receipt, so it never enters the Drive archive.
  storage_path text,

  institution text,
  account_label text,
  period_start date,
  period_end date,
  -- First of the month the statement mostly covers. Drives the default month
  -- the imported expenses land in.
  period_month date,

  status text not null default 'Parsing'
    check (status in ('Parsing', 'Review', 'Imported', 'Failed', 'Discarded')),
  parse_error text,

  -- Which model read the statement, so a bad batch can be traced to a model change.
  model text,
  -- Arithmetic cross-check of the extraction against the totals the statement
  -- prints on itself: { statedTotalDebits, extractedTotalDebits, balanced, ... }
  reconciliation jsonb not null default '{}'::jsonb,
  -- Raw model output from both passes. Never read by the app; kept so a disputed
  -- row can be checked against what the model actually said.
  raw_passes jsonb not null default '[]'::jsonb,

  imported_at timestamptz
);

-- ---------------------------------------------------------------------------
-- One proposed transaction
--
-- `source` separates what the scan found from what the user typed in by hand,
-- so a statement can be topped up with cash spending it never saw.
-- ---------------------------------------------------------------------------
create table if not exists statement_import_rows (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_id uuid not null references statement_imports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,

  row_index integer not null default 0,

  date date not null,
  -- Verbatim statement descriptor, kept so the row can always be traced back.
  description text not null default '',
  -- Human-readable name derived from the descriptor; what the expense is titled.
  merchant text not null default '',
  amount numeric(12, 2) not null default 0,
  direction text not null default 'Debit' check (direction in ('Debit', 'Credit')),

  category text,
  notes text,
  receipt_id uuid references receipts(id) on delete set null,

  decision text not null default 'Include'
    check (decision in ('Include', 'Flag', 'Exclude')),
  -- The model's own confidence that it read this line correctly.
  confidence text not null default 'high' check (confidence in ('high', 'low')),
  -- True when a saved merchant rule pre-filled this row's category/decision.
  auto_applied boolean not null default false,

  source text not null default 'Statement' check (source in ('Statement', 'Manual')),
  expense_id uuid references expenses(id) on delete set null
);

-- ---------------------------------------------------------------------------
-- Remembered decisions
--
-- `match_key` is a normalized fingerprint of the statement descriptor — card
-- numbers, trailing store ids, and POS noise stripped out — so "SQ *CHEWY 4417"
-- and "SQ *CHEWY 9902" resolve to the same rule. Confirming an import upserts
-- one rule per decided row, and the next import pre-selects from them.
-- ---------------------------------------------------------------------------
create table if not exists merchant_rules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,

  match_key text not null,
  sample_description text,
  merchant text,
  category text,
  decision text not null default 'Include' check (decision in ('Include', 'Exclude')),
  notes text,

  times_applied integer not null default 0,
  last_used_at timestamptz,

  unique (user_id, match_key)
);

-- ---------------------------------------------------------------------------
-- Expenses table extension
-- ---------------------------------------------------------------------------
alter table expenses add column if not exists statement_import_id uuid
  references statement_imports(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Row level security — same admin-aware shape as every other table.
-- ---------------------------------------------------------------------------
alter table statement_imports enable row level security;
alter table statement_import_rows enable row level security;
alter table merchant_rules enable row level security;

drop policy if exists "Users and admins can manage statement imports" on statement_imports;
create policy "Users and admins can manage statement imports"
  on statement_imports for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

drop policy if exists "Users and admins can manage statement import rows" on statement_import_rows;
create policy "Users and admins can manage statement import rows"
  on statement_import_rows for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

-- Merchant memory is deliberately per-user and NOT admin-wide: Yana's sense of
-- what counts as a business expense should not pre-select rows on someone else's
-- import. Admins still read the rows themselves through the policies above.
drop policy if exists "Users can manage their merchant rules" on merchant_rules;
create policy "Users can manage their merchant rules"
  on merchant_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists statement_imports_user_idx
  on statement_imports (user_id, created_at desc);
create index if not exists statement_imports_open_idx
  on statement_imports (user_id, created_at desc)
  where status in ('Parsing', 'Review');
create index if not exists statement_import_rows_import_idx
  on statement_import_rows (import_id, row_index);
create index if not exists merchant_rules_lookup_idx
  on merchant_rules (user_id, match_key);
create index if not exists expenses_statement_import_idx
  on expenses (statement_import_id);
