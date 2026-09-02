-- A standing figure can stop.
--
-- Until now the only way to end a commitment was to enter a change to 0 on the
-- date it stopped. That works arithmetically and reads badly: the line keeps a
-- $0.00 row in every month for the rest of time, and "cancelled in September"
-- and "still running, currently free" are stored as the same thing.
--
-- So a rate gets an optional end date. `effective_to` is **inclusive** — the
-- amount is paid up to and including that day and nothing after it, until the
-- next dated change (if there is one) starts. Null means what it has always
-- meant: this is what the line is worth from `effective_from` until something
-- says otherwise.
--
-- Nothing needs backfilling. Every existing rate is open-ended, which is null,
-- which is what `add column` gives them.
--
-- Re-runnable.

alter table finance_line_rates
  add column if not exists effective_to date;

alter table finance_line_rates
  drop constraint if exists finance_line_rates_range_check;
alter table finance_line_rates
  add constraint finance_line_rates_range_check
  check (effective_to is null or effective_to >= effective_from);

comment on column finance_line_rates.effective_to is
  'Inclusive last day this amount is paid. Null means the line is still running.';
