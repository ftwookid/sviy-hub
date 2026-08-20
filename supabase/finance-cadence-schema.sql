-- How often a standing figure actually arrives.
--
-- Every rate was a `monthly_amount` and nothing asked whether the figure typed
-- into it was monthly. A W2 paid every second week went in as the paycheck, so
-- gross income read about 2.17x too low (26 paydays a year, not 12) and every
-- net, left-over and year figure inherited it. Nothing on the page could say so,
-- because the cadence was never recorded.
--
-- So a rate now keeps both: `entered_amount` and `cadence` are what somebody
-- typed, and `monthly_amount` is the figure derived from the pair. The derived
-- column stays the one every reader spends — the month build, the year rail and
-- the reports are unchanged, and a cadence can never be half-applied by a reader
-- that forgot to convert.
--
-- Re-runnable. Existing rows were monthly by definition, which is exactly what
-- the defaults and the backfill below say.

alter table finance_line_rates
  add column if not exists cadence text not null default 'Monthly';

alter table finance_line_rates
  add column if not exists entered_amount decimal(12,2);

-- What was typed, for every row written before this ran: the monthly figure,
-- because that is what the single column meant.
update finance_line_rates
  set entered_amount = monthly_amount
  where entered_amount is null;

alter table finance_line_rates
  alter column entered_amount set default 0;
alter table finance_line_rates
  alter column entered_amount set not null;

alter table finance_line_rates
  drop constraint if exists finance_line_rates_entered_amount_check;
alter table finance_line_rates
  add constraint finance_line_rates_entered_amount_check
  check (entered_amount >= 0);

-- The list is closed on purpose: the app converts each of these to a month with
-- a fixed factor, so a value it has never heard of would be spent as though it
-- were monthly.
alter table finance_line_rates
  drop constraint if exists finance_line_rates_cadence_check;
alter table finance_line_rates
  add constraint finance_line_rates_cadence_check
  check (cadence in ('Weekly', 'Bi-weekly', 'Semi-monthly', 'Monthly', 'Quarterly', 'Annual'));

comment on column finance_line_rates.entered_amount is
  'What was typed, at `cadence`. The paycheck, the quarterly bill.';
comment on column finance_line_rates.cadence is
  'How often `entered_amount` arrives. Bi-weekly is 26 a year; Semi-monthly is 24.';
comment on column finance_line_rates.monthly_amount is
  'Derived from entered_amount x cadence. The figure every reader on the page spends.';
