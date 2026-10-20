-- Bank and card transactions.
--
-- Finances has only ever stored commitments someone typed in: a paycheck, rent,
-- a subscription, a utility bill. This table is the other half — what a bank or
-- card account actually posted. Rows are written by an importer (a Plaid feed
-- elsewhere), not by hand. The screen that reads them only changes the category
-- and the project.
--
-- One category and one project per row. Both are closed lists, stored as text
-- with a check constraint, the same way a finance line's bucket is stored.
-- There is no lookup table: the app has never used one for a closed list.
--
-- Re-import is an upsert on `external_id`, which is the Plaid `transaction_id`
-- of the *posted* transaction. Pending ids change when a charge posts, so they
-- are not a stable key and must not be written here.
--
-- On conflict, refresh the bank-sourced columns (`date`, `amount`, `merchant`,
-- `account_label`) and leave `category`, `project` and `notes` alone unless the
-- importer is deliberately recategorising. Those three are what a person edits.
--
-- `amount` uses Plaid's sign: positive when money leaves the account, negative
-- when money arrives (income, a refund, a payment onto a card). The screen
-- shows the absolute value and uses colour for the direction.
--
-- `user_id` is attribution, the same column every other finance table carries.
-- It is not a permission. The policy below is the shared-workspace policy those
-- tables use: anyone signed in reads and writes every row.
--
-- Re-runnable. No seed rows — this repo is public, and an example transaction
-- does not belong in it.

create table if not exists bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,

  external_id text not null,

  date date not null,
  amount decimal(12,2) not null,
  merchant text not null default '',
  account_label text not null default '',
  category text not null,
  project text not null,
  notes text
);

alter table bank_transactions
  drop constraint if exists bank_transactions_category_check;
alter table bank_transactions
  add constraint bank_transactions_category_check
  check (category in (
    'Bills',
    'Family & home',
    'Fun',
    'Planned purchases',
    'Business',
    'Saving & investing',
    'Transfers & card payments',
    'One-time family help',
    'Income'
  ));

alter table bank_transactions
  drop constraint if exists bank_transactions_project_check;
alter table bank_transactions
  add constraint bank_transactions_project_check
  check (project in (
    'Personal',
    'Speedrack West',
    'Lenokers',
    'Facility Goods',
    'Sviy-Hub'
  ));

-- The upsert key. One household, so the Plaid id is unique on its own.
alter table bank_transactions
  drop constraint if exists bank_transactions_external_id_key;
alter table bank_transactions
  add constraint bank_transactions_external_id_key unique (external_id);

create index if not exists bank_transactions_date_idx
  on bank_transactions (date desc);

alter table bank_transactions enable row level security;

-- Shared, like finance_lines and utility_bills. Dropped by lookup rather than
-- by name, because a stale owner-scoped policy would not block anything
-- (policies OR together) but would misdescribe who can see a row.
do $$
declare
  existing text;
begin
  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'bank_transactions'
  loop
    execute format('drop policy %I on public.bank_transactions', existing);
  end loop;
end $$;

create policy "Shared workspace" on bank_transactions
  for all to authenticated
  using (true) with check (true);

comment on table bank_transactions is
  'Posted bank and card transactions. One category and one project per row. Upsert on external_id.';

comment on column bank_transactions.external_id is
  'Plaid transaction_id of the posted transaction. Unique. The upsert conflict target.';

comment on column bank_transactions.amount is
  'Plaid sign: positive when money leaves the account, negative when money arrives.';

comment on column bank_transactions.user_id is
  'Who the row is attributed to. Not a permission — see the shared workspace policy.';
