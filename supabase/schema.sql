create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  date date not null,
  merchant text not null,
  description text,
  amount decimal(10,2) not null,
  category text not null,
  payment_method text not null default 'Main card',
  receipt_url text,
  receipt_filename text,
  notes text,
  user_id uuid references auth.users(id) on delete cascade
);

alter table expenses enable row level security;

drop policy if exists "Users can manage their own expenses" on expenses;
create policy "Users can manage their own expenses"
  on expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists expenses_user_date_idx on expenses (user_id, date desc);
create index if not exists expenses_user_category_idx on expenses (user_id, category);

-- In Supabase Storage, create a private bucket named "receipts".
-- Recommended Storage policies for the private receipts bucket:
--
-- create policy "Users can upload their own receipts"
--   on storage.objects for insert
--   with check (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can view their own receipts"
--   on storage.objects for select
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can update their own receipts"
--   on storage.objects for update
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
--
-- create policy "Users can delete their own receipts"
--   on storage.objects for delete
--   using (
--     bucket_id = 'receipts'
--     and auth.uid()::text = (storage.foldername(name))[1]
--   );
