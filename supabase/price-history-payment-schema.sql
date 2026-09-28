-- How a client paid, dated alongside what they paid.
--
-- A client who moves from Rover to Venmo changes two things on one day: the
-- price, and whether Rover takes 20% of it. Keeping the payment method only on
-- `clients` meant switching it rewrote every past month as if Rover had never
-- taken a cut (or kept taking one after it stopped). Each dated price now
-- carries the method it was paid through.
--
-- Nullable on purpose: null means "whatever the client record says", which is
-- what every row written before this migration meant. Re-runnable.

alter table price_history
  add column if not exists payment_method text;

alter table price_history
  drop constraint if exists price_history_payment_method_check;

alter table price_history
  add constraint price_history_payment_method_check
  check (payment_method is null or payment_method in ('Rover', 'Venmo', 'Cash'));

-- Visit days, dated the same way. Going from one walk a week to two is a
-- change of terms like any other, and it must not re-price the months before
-- it. Comma-separated weekdays ("Tue, Thu"), matching clients.frequency_label;
-- null means "whatever the client record says".
alter table price_history
  add column if not exists visit_days text;
