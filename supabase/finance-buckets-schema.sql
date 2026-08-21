-- The buckets the month is made of.
--
-- One statement, and it replaces the two earlier bucket migrations
-- (finance-deductions-bucket-schema.sql, finance-subscriptions-bucket-schema.sql)
-- rather than adding a third file to run in order. Re-runnable, and safe to run
-- whether or not those two were applied.
--
-- Two buckets are new here:
--
--   Subscriptions — the recurring services worth cancelling. Filed under Needs
--   they were invisible: one $2,000 rent line drowns nine small ones, and "what
--   am I paying for every month that I no longer use" cannot be read off a total.
--   Of everything on this page it is the part a household can actually cut.
--
--   Wants — recurring discretionary spending. A haircut every month is not a
--   need and is not a subscription, and lumping it into Needs quietly overstates
--   the part of the budget that cannot move.
--
-- The order below is the order the month happens in: what comes in, what is taken
-- before the paycheck lands, then what is spent out of what landed.

alter table finance_lines
  drop constraint if exists finance_lines_bucket_check;
alter table finance_lines
  add constraint finance_lines_bucket_check
  check (
    bucket in (
      'Gross Income',
      'Tax Withheld',
      'Deductions',
      'Investments & Savings',
      'Needs',
      'Subscriptions',
      'Debt',
      'Wants'
    )
  );
