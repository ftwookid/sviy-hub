-- Where the household lived, and from when.
--
-- Finances could say what a bill costs and how it has moved. It could not answer
-- the question that actually decides whether a move was worth making: **is it
-- more expensive to live here than it was at the last place?** Every figure to
-- answer that already exists — years of electricity, water, rent — and nothing
-- in the database said which of them were paid at which address, so a $131
-- average and an $88 average sat in the same column with no way to tell them
-- apart.
--
-- One table, one row per home, and one date on it. A home runs from `moved_in`
-- until the next home starts, so there is no end date to keep in step with the
-- next row's start — the single most common way a dated pair of columns goes
-- wrong. The current home is simply the last one.
--
-- It is deliberately **not** joined to anything. Any month can be attributed to
-- a home by comparing dates, so rent, each utility and any typed line are all
-- read by home without a foreign key on any of them, and deleting a home cannot
-- take a figure with it.
--
-- Re-runnable.

create table if not exists finance_homes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  moved_in date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Two homes cannot start on the same day: the month either belongs to one or the
-- other, and a tie would be resolved by whichever row happened to sort first.
create unique index if not exists finance_homes_moved_in_key on finance_homes (moved_in);

create index if not exists finance_homes_moved_in_idx on finance_homes (moved_in);

alter table finance_homes enable row level security;

-- Shared, like every other table: one household, one set of books. Dropped by
-- lookup rather than by name, because a stale owner-scoped policy would not
-- block anything (policies OR together) but would misdescribe the schema to the
-- next person reading it.
do $$
declare
  existing text;
begin
  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'finance_homes'
  loop
    execute format('drop policy %I on public.finance_homes', existing);
  end loop;
end $$;

create policy "Shared workspace" on finance_homes
  for all to authenticated
  using (true) with check (true);

comment on table finance_homes is
  'Addresses the household has lived at. A home runs from moved_in until the next home starts.';
comment on column finance_homes.moved_in is
  'First day at this home. The previous home is treated as ending the day before.';
