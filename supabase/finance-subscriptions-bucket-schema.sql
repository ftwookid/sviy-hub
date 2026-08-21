-- Subscriptions get their own bucket.
--
-- Finances is a record of what the household is *committed* to — the figures
-- that repeat whether anybody thinks about them or not. Rent and payroll tax
-- cannot be argued with; a pile of £10-a-month services can, and that is the one
-- part of a committed budget anybody can actually cut. Filed under Needs they
-- were invisible: one $2,395 line drowns nine small ones, and "what am I paying
-- for every month that I no longer use" is unanswerable from a total.
--
-- Its own bucket means its own total, its own share of income and its own yearly
-- run rate, which is the figure that makes somebody cancel something.
--
-- Re-runnable.

alter table finance_lines
  drop constraint if exists finance_lines_bucket_check;
alter table finance_lines
  add constraint finance_lines_bucket_check
  check (bucket in ('Gross Income', 'Tax Withheld', 'Deductions', 'Needs', 'Subscriptions', 'Debt', 'Investments & Savings'));
