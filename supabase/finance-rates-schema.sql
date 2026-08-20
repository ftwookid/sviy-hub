-- A standing figure is a schedule, not a number.
--
-- `finance_lines` held one monthly amount per line, which stood in every month
-- forever. That was wrong in the one way that matters: a W2 that went from
-- $10,000 to $12,000 on 20 July rewrote January as well, because there was
-- nowhere for the old figure to live. Every past month silently restated itself
-- every time a raise, a rent increase or a paid-off loan was typed in.
--
-- So each line now owns a dated schedule. One row per change, `effective_from`
-- inclusive — the new amount applies **on** its date — and the month it lands in
-- is blended across the days either side of it. Nothing about a past month moves
-- when a future change is entered.
--
-- Ending a line is a change to 0, not a deletion: the months it did run still
-- have to add up.
--
-- Re-runnable.

create table if not exists finance_line_rates (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references finance_lines(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  monthly_amount decimal(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table finance_line_rates
  drop constraint if exists finance_line_rates_amount_check;
alter table finance_line_rates
  add constraint finance_line_rates_amount_check
  check (monthly_amount >= 0);

-- One amount per line per date. Entering the same date twice is a correction to
-- that change, not a second change on the same day.
create unique index if not exists finance_line_rates_line_date_idx
  on finance_line_rates (line_id, effective_from);
create index if not exists finance_line_rates_line_idx
  on finance_line_rates (line_id, effective_from desc);

alter table finance_line_rates enable row level security;

do $$
declare
  existing text;
begin
  for existing in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'finance_line_rates'
  loop
    execute format('drop policy %I on public.finance_line_rates', existing);
  end loop;
end $$;

create policy "Shared workspace" on finance_line_rates
  for all to authenticated
  using (true) with check (true);

-- Carry the old single amount over as each line's opening rate, so nothing that
-- was already typed in disappears. It starts on 1 January of the year the line
-- was created: the old column had no date at all, and the start of the books is
-- the only honest reading of "it has always been this".
--
-- Guarded per line rather than per table, so a line added after this migration
-- ran does not get a phantom opening rate on the next re-run.
insert into finance_line_rates (line_id, user_id, effective_from, monthly_amount)
select
  line.id,
  line.user_id,
  date_trunc('year', line.created_at)::date,
  coalesce(line.monthly_amount, 0)
from finance_lines line
where not exists (
  select 1 from finance_line_rates rate where rate.line_id = line.id
);

-- The old column is no longer read by the app. It stays only so this migration
-- has something to read on a re-run against an older row, and so a rollback to
-- the previous deploy is not a data loss.
comment on column finance_lines.monthly_amount is
  'Legacy. Superseded by finance_line_rates; not read by the app.';
