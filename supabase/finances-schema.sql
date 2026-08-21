-- The household's month.
--
-- Taxes, Clients and House Sitting each answer one question about the
-- business. None of them answers the question the family actually asks at the
-- end of a month: did more come in than went out. That needs figures the app has
-- never held — a W2, what the taxman already took, rent, the car loan, what went
-- into savings.
--
-- One table, one row per line item. A line carries a single monthly amount and
-- that amount stands for every month, because these are the standing figures of
-- a household: rent does not need retyping in March. Anything that genuinely
-- varies month to month — house sitting, business spending, miles — is read from
-- the tables that already record it, and is not stored here at all.
--
-- Amounts are always positive. Which direction a line moves money is a property
-- of its bucket, not its sign, so a mistyped minus cannot turn rent into income.
--
-- Re-runnable.

create table if not exists finance_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  label text not null,
  monthly_amount decimal(12,2) not null default 0,
  note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table finance_lines
  drop constraint if exists finance_lines_bucket_check;
alter table finance_lines
  add constraint finance_lines_bucket_check
  check (bucket in ('Gross Income', 'Tax Withheld', 'Deductions', 'Needs', 'Debt', 'Investments & Savings'));

alter table finance_lines
  drop constraint if exists finance_lines_amount_check;
alter table finance_lines
  add constraint finance_lines_amount_check
  check (monthly_amount >= 0);

create index if not exists finance_lines_bucket_idx on finance_lines (bucket, sort_order);

alter table finance_lines enable row level security;

-- Shared, like every other table: one household, one set of books.
do $$
declare
  existing text;
begin
  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'finance_lines'
  loop
    execute format('drop policy %I on public.finance_lines', existing);
  end loop;
end $$;

create policy "Shared workspace" on finance_lines
  for all to authenticated
  using (true) with check (true);

-- One starter line, so the first visit is not an empty page and the W2 — the
-- figure the whole month hangs off — has somewhere to go. Seeded only when the
-- table is completely untouched, so re-running never resurrects a line somebody
-- deliberately deleted.
insert into finance_lines (user_id, bucket, label, monthly_amount, sort_order)
select id, 'Gross Income', 'Ivan W2', 0, 0
from auth.users
where not exists (select 1 from finance_lines)
order by created_at
limit 1;
