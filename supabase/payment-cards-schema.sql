-- Sviy Hub — Saved cards.
-- Safe to run more than once.
--
-- Transactions record how they were paid as plain text on `expenses`, and always
-- have. This table is only the list of cards worth offering in the picker, kept
-- by nickname — no card numbers, no expiry, nothing worth stealing.
--
-- Because the expense keeps the text and not a foreign key, deleting a card
-- cannot rewrite history: the transactions that used it still say so, the card
-- just stops being offered for new ones.

create table if not exists payment_cards (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (length(trim(nickname)) > 0)
);

-- One "Amex Gold" per person, however it was capitalised on the day.
create unique index if not exists payment_cards_user_nickname_idx
  on payment_cards (user_id, lower(trim(nickname)));

alter table payment_cards enable row level security;

drop policy if exists "Users and admins can manage payment cards" on payment_cards;
create policy "Users and admins can manage payment cards"
  on payment_cards for all
  using (auth.uid() = user_id or is_admin())
  with check (auth.uid() = user_id or is_admin());

-- Seed each person's list from what their own transactions already say they
-- paid with, so nobody opens the picker to an empty list and no existing row
-- points at a card that is no longer offered. Cash is built in, not a card.
insert into payment_cards (user_id, nickname)
select distinct e.user_id, trim(e.payment_method)
from expenses e
where e.user_id is not null
  and coalesce(trim(e.payment_method), '') <> ''
  and lower(trim(e.payment_method)) <> 'cash'
on conflict do nothing;
