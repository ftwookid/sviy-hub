-- Utilities: a standing commitment whose amount is never the same twice.
--
-- Every other figure on Finances is a *schedule* — rent is $2,395 from a date,
-- and it stays $2,395 until somebody types a change. That shape is exactly wrong
-- for water, power and gas: the amount moves every single month, nobody is going
-- to enter a dated "change" twelve times a year, and the question these bills
-- actually raise is one a schedule cannot answer at all — is it creeping up?
--
-- So a utility is two tables. An **account** is the thing you pay: its name, and
-- which bucket on Finances it belongs to (Needs by default, because these are
-- the definition of a cost you cannot avoid — but it is a column, not a
-- constant, so a metered internet line can be filed under Subscriptions if that
-- is where its owner looks for it). A **bill** is one month's actual amount.
--
-- One bill per account per month, keyed on the first of the month, so a bill is
-- corrected by re-entering it rather than stacking a second one. The month is
-- the month the bill covers — which is the month Finances counts it in.
--
-- Amounts are positive. Direction is a property of the bucket, exactly as it is
-- for finance_lines, so a mistyped minus cannot turn a water bill into income.
--
-- Re-runnable.

create table if not exists utility_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  bucket text not null default 'Needs',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only the buckets money goes *out* of. A water bill is not gross income, and
-- offering a choice that cannot be right is worse than offering none.
alter table utility_accounts
  drop constraint if exists utility_accounts_bucket_check;
alter table utility_accounts
  add constraint utility_accounts_bucket_check
  check (bucket in ('Tax Withheld', 'Deductions', 'Needs', 'Subscriptions', 'Debt', 'Investments & Savings'));

create index if not exists utility_accounts_order_idx on utility_accounts (sort_order, name);

create table if not exists utility_bills (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references utility_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Always the 1st. It names the month the bill covers, not the day it was paid.
  period_month date not null,
  amount decimal(12,2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);

alter table utility_bills
  drop constraint if exists utility_bills_amount_check;
alter table utility_bills
  add constraint utility_bills_amount_check
  check (amount >= 0);

-- One bill per account per month. Entering the same month twice corrects it.
create unique index if not exists utility_bills_account_month_idx
  on utility_bills (account_id, period_month);
create index if not exists utility_bills_account_idx
  on utility_bills (account_id, period_month desc);

alter table utility_accounts enable row level security;
alter table utility_bills enable row level security;

-- Shared, like every other table: one household, one set of books. Dropped by
-- lookup rather than by name, because a stale owner-scoped policy would not
-- block anything (policies OR together) but would misdescribe the schema to
-- whoever reads it next.
do $$
declare
  target text;
  existing text;
begin
  foreach target in array array['utility_accounts', 'utility_bills'] loop
    for existing in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = target
    loop
      execute format('drop policy %I on public.%I', existing, target);
    end loop;
    execute format(
      'create policy "Shared workspace" on public.%I for all to authenticated using (true) with check (true)',
      target
    );
  end loop;
end $$;
