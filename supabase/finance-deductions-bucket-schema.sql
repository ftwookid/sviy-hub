-- Deductions becomes a bucket you type into.
--
-- The Finances page had a block called Deductions that was read off the books:
-- business spending plus the mileage deduction. That is a Taxes question — it is
-- what Reports exists to total — and putting it in the middle of a cash-flow page
-- meant a figure that could not be subtracted from a bank balance sat where the
-- household's own deductions should have been. The money actually taken out of a
-- paycheck before it lands — health insurance, a repayment, a garnishment — had
-- nowhere to go.
--
-- So Deductions is now the sixth typed bucket, with dated amounts and a cadence
-- like every other standing figure. Nothing is migrated: there was never a stored
-- row in this bucket, only a derived block.
--
-- Re-runnable.

alter table finance_lines
  drop constraint if exists finance_lines_bucket_check;
alter table finance_lines
  add constraint finance_lines_bucket_check
  check (bucket in ('Gross Income', 'Tax Withheld', 'Deductions', 'Needs', 'Debt', 'Investments & Savings'));
