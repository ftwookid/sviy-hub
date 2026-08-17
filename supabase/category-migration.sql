-- Move stored categories onto the nine the business actually uses.
--
-- The old list was the full Schedule C set (22 line items); most were never
-- picked. This maps every old value onto its nearest new one. It is safe to
-- re-run: rows already carrying a current category are left alone.
--
-- The app normalizes these same values on read, so it behaves correctly both
-- before and after this runs. Running it just makes the stored data match.

begin;

-- One mapping, applied to every table that stores a category.
create temporary table category_mapping (old_value text primary key, new_value text not null) on commit drop;

insert into category_mapping (old_value, new_value) values
  ('Advertising',                    'Miscellaneous'),
  ('Car & Truck',                    'Transportation'),
  ('Commissions & Fees',             'Professional Services'),
  ('Contract Labor',                 'Professional Services'),
  ('Depreciation',                   'Miscellaneous'),
  ('Employee Benefits',              'Miscellaneous'),
  ('Insurance',                      'Insurance'),
  ('Interest — Mortgage',            'Miscellaneous'),
  ('Interest — Other',               'Miscellaneous'),
  ('Legal & Professional',           'Professional Services'),
  ('Meals & Entertainment',          'Meals'),
  ('Office Expense',                 'Home Office'),
  ('Other Expense',                  'Miscellaneous'),
  ('Pension & Profit Sharing',       'Miscellaneous'),
  ('Rent — Machinery',               'Miscellaneous'),
  ('Rent — Other Business Property', 'Home Office'),
  ('Repairs & Maintenance',          'Miscellaneous'),
  ('Supplies',                       'Supplies'),
  ('Taxes & Licenses',               'Miscellaneous'),
  ('Travel',                         'Transportation'),
  ('Utilities',                      'Home Office'),
  ('Wages',                          'Professional Services');

update expenses e
set category = m.new_value
from category_mapping m
where e.category = m.old_value
  and e.category <> m.new_value;

update statement_import_rows r
set category = m.new_value
from category_mapping m
where r.category = m.old_value
  and r.category <> m.new_value;

-- Merchant memory replays a category onto next month's statement, so it has to
-- move too or the old headings come straight back.
update merchant_rules r
set category = m.new_value
from category_mapping m
where r.category = m.old_value
  and r.category <> m.new_value;

-- Anything not in the mapping and not already current falls to Miscellaneous,
-- so no row is left holding a category the app cannot show.
update expenses
set category = 'Miscellaneous'
where category is not null
  and category not in (
    'Transportation', 'Supplies', 'Software & Apps', 'Insurance',
    'Professional Services', 'Meals', 'Phone & Communications',
    'Home Office', 'Miscellaneous'
  );

update statement_import_rows
set category = 'Miscellaneous'
where category is not null
  and category not in (
    'Transportation', 'Supplies', 'Software & Apps', 'Insurance',
    'Professional Services', 'Meals', 'Phone & Communications',
    'Home Office', 'Miscellaneous'
  );

update merchant_rules
set category = 'Miscellaneous'
where category is not null
  and category not in (
    'Transportation', 'Supplies', 'Software & Apps', 'Insurance',
    'Professional Services', 'Meals', 'Phone & Communications',
    'Home Office', 'Miscellaneous'
  );

commit;

-- What ended up where.
select category, count(*) as transactions
from expenses
group by category
order by transactions desc;
