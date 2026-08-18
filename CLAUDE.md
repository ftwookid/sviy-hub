# Sviy Hub Project Context

## Project Overview

Sviy Hub is a private, single-user family CRM and business tracker for a small pet-care business. It started as an expense tracker and is now being expanded into a polished, native-feeling app for managing clients, pets, income estimates, profile/account details, and Schedule C-ready expense reporting.

The app should feel calm, premium, warm, and consumer-grade. The design direction is soft off-white backgrounds, warm gold accents, generous whitespace, rounded corners, subtle shadows, and comfortable mobile-first tap targets.

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- lucide-react icons
- Google Places API for client address autocomplete

Local dev uses a project-local Node runtime under `work/node-runtime` because system `npm` was not available in the original Codex shell.

Use the local runtime explicitly when running Node/npm commands:

```bash
PATH="$PWD/work/node-runtime/node-v22.12.0-darwin-arm64/bin:$PATH" npm run dev
PATH="$PWD/work/node-runtime/node-v22.12.0-darwin-arm64/bin:$PATH" npm run typecheck
```

## Environment Variables

Required variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
```

Do not commit `.env.local`. It is ignored by git.

Current local setup:

- `.env.local` exists in this project now.
- Credentials were copied from the previous local workspace at `/Users/ivan_personal/Documents/Codex/2026-06-08/i-have-no-idea-how-to/.env.local`.
- `.gitignore` was added and ignores `.env.local`, `.next/`, `node_modules/`, `.DS_Store`, and `tsconfig.tsbuildinfo`.

Google Places note: local testing currently uses `http://localhost:3000`. To make both common local URLs work, the Google Cloud API key restrictions should include:

```text
http://127.0.0.1:3000/*
http://localhost:3000/*
```

## Handing Over SQL Migrations

Ivan runs migrations by pasting them into the Supabase SQL Editor, in a UI where
he cannot open a file by path. A response that says "run `supabase/foo.sql`" is
unusable to him — he sees nothing.

So whenever a task needs a migration run:

1. Write the `.sql` file into `supabase/` as usual, so it stays version controlled.
2. **Also paste its entire contents into the chat response**, in a fenced `sql`
   block, before saying anything about running it.

Never truncate, never summarize with "…rest unchanged", never substitute a `cat`
command for the content. This applies to anything else he has to run outside the
repo too — shell commands, dashboard config, environment values.

The migration checklist in `## Next Step` below names files on purpose: it is a
record of what still has to be applied. It is **not** a template for how to hand
one over. Reading a file name there is the cue to paste that file's contents.

## Completed So Far

### Base App

- Created the Next.js app structure.
- Added Supabase client setup.
- Added Supabase SQL schema for expenses.
- Added private login flow with Supabase email/password auth.
- Added `.env.example` and `.env.local` setup.
- Installed dependencies and started the dev server.
- Initialized git and pushed the project to GitHub.

### Branding

- Renamed the app from Yani to Sviy Hub.
- Updated UI branding, metadata, README, package name, and CSV export naming.

### Expenses

- Built the main expenses dashboard.
- Added summary stat cards.
- Added quick-add expense form.
- Added receipt upload support using Supabase Storage.
- Added expense list with filters.
- Added edit/delete expense behavior.
- Added a quick receipt attach button on transaction rows with no proof
  (`components/expenses/QuickReceiptButton.tsx`). It opens the file picker
  straight from the row and does the same three steps as the slide-over —
  upload, point the expense at the receipt, archive to Drive — clearing
  `proof_waived`/`proof_note` on the way. It shows only for `Missing` proof, not
  `Waived`, and updates the row in place rather than calling `loadMonth()`,
  which would flash a skeleton over the list mid-run. Swapping or removing a
  receipt still belongs to the slide-over.
- Added reports page with Schedule C table, monthly breakdown, and CSV export.
- Moved Reports into the Expenses section as an Expenses/Reports segmented sub-tab.

### Saved Cards

`expenses.payment_method` used to be three fixed values — Main card, Other card,
Cash — which made every card past the first "Other", exactly when the useful
question is which account a charge came out of.

- `payment_cards` (`supabase/payment-cards-schema.sql`) holds one row per card:
  a nickname and an owner, nothing else. No numbers, no expiry — the nickname is
  the whole record, because its only job is to be recognisable in a picker.
- The expense still stores the **text**, not a foreign key. Deleting a card
  therefore cannot rewrite history: the transactions that used it still say so,
  it just stops being offered for new ones.
- `PaymentMethod` is now `string`: "Cash", or a card nickname.
- `PaymentMethodPicker` is the one control, used by both the transaction
  slide-over and the statement review. It offers Cash, the saved cards, and
  always the current value — an old row naming a deleted card must not silently
  read as paid some other way.
- Adding a card is inline: `+ Card`, type a nickname, Enter. Removing sits
  behind the pencil, so a stray tap mid-entry cannot delete anything, and takes
  no confirmation once you are in there.
- While no card is saved, the picker falls back to the original three. That
  covers a new account and, more to the point, the window before the migration
  has been run, when the card list cannot load at all.
- The migration seeds each person's cards from the distinct `payment_method`
  values already on their own transactions, so nobody opens the picker to an
  empty list.

### Proof Sheets — one file as proof for many transactions

Some costs arrive as fifty tiny charges plus one monthly report that accounts for
all of them: parking, tolls, transit. Uploading the same spreadsheet against each
$2.10 row by hand is the worst job on the page, so the Add dialog has a third
option — **Prove many with one file** — that does it in one pass.

Flow:

1. Add → `Prove many with one file` → drop a `.xlsx`, `.csv`, or `.pdf`.
2. `POST /api/receipts/proof-sheet` reads the file and returns proposed matches.
   Nothing is written and the file is not uploaded yet.
3. `ProofSheetReview` shows each match as a pair — the transaction on top, the
   report line that proves it beneath — all pre-ticked.
4. Confirming uploads the file once as a single receipt, points every ticked
   transaction at it, and archives it to Drive like any other receipt. The
   receipt files under the month its charges fall in, and the page lands on that
   month afterwards.

How a file is read:

- Spreadsheets never pass their numbers through a model. `lib/spreadsheet.ts`
  unzips the `.xlsx` and returns a plain `string[][]` — no dependency, since an
  xlsx is a zip of XML — decoding dates via `styles.xml` so Excel serials come
  back as real dates. The model is asked only to **name the columns**
  (`mapSheetColumns`), and `linesFromGrid()` reads the values out of the grid.
  Which column is the amount is a judgement call, and headings vary per vendor
  ("Total Fee", "Amount Charged"); copying four hundred amounts is not a
  judgement call, and one misread digit would file proof against a transaction
  it does not prove.
- The amount column is the **grand total** for a line, since that is what the
  card was charged. These reports usually print the fee and the tax separately
  as well, and again inside the total.
- A PDF report has no grid to read, so there the model transcribes
  (`transcribeProofPdf`). Same line shape, same review screen.
- `lib/anthropicJson.ts` holds the one schema-pinned model call both this and the
  statement scan use.

How lines are matched (`matchProofLines` in `lib/proofSheets.ts`):

- Amounts must agree to the cent, and the dates must fall in a window running
  from 2 days before to 6 days after the report's date — cards settle late, and
  a Saturday charge posts on the Monday.
- Only transactions with **no receipt yet** are candidates. A row that already
  has one has better proof than a summary, and replacing it silently would
  retire a file someone chose.
- Candidate pairs are ranked by how close the dates are and claimed one-to-one,
  so three identical $2.10 charges never all match the single nearest row.
- Matching runs across everyone's transactions, since the books are shared.
- Nothing about the match is decided by a model. A wrong match is a receipt
  attached to a transaction it does not prove — the exact thing an audit looks
  for — so the review screen exists and every match can be unticked.

Because one receipt can now cover fifty transactions, `POST /api/receipts/discard`
refuses to retire a receipt while any expense still points at it. Deleting one
parking charge must not trash the file proving the other forty-nine.

### Navigation Redesign

- Removed the old top navigation header.
- Added `AppShell` with:
  - Desktop left sidebar.
  - Mobile fixed bottom tab bar.
  - Three sections: Deductions, Clients, Profile.
- Added safe mobile bottom padding so content does not sit under the tab bar.
- Strengthened the visual system with warmer backgrounds, larger form controls, softer shadows, and more rounded cards.

### Deductions Section

Everything that lowers the tax bill is one nav item — **Deductions** — with four
tabs across the top (`components/SectionTabs.tsx`):

| Tab | Route | Question it answers |
| --- | --- | --- |
| Transactions | `/`, `/import` | What did we spend? |
| Mileage | `/mileage` | What did we drive, and what does the car take back? |
| Reports | `/reports` | What does the year come to? |

`/car` redirects to `/mileage`.

Spending and driving are the same deduction asked twice, so splitting them
across top-level tabs meant nobody could see the year's real number in one
place. `DEDUCTION_ROUTES` in `AppShell` keeps all five routes lighting the same
nav item.

The old `Expenses` h1 is gone from `/` and `/reports`. The sidebar already names
the section and the tab row already names the page; a third label said nothing.

Reports now adds the mileage deduction to the year:

- A headline card gives one number — spent plus driven — because that is the
  number the section exists to produce.
- The monthly breakdown bars are stacked, spent in gold and driven in sand.
- Mileage is read straight off the active uploads, so restoring a different
  month's import moves the report total with it.

### Mileage

Two containers: the driving, then what the car takes out of it.

The driving:

- A three-cell strip — miles, deduction, average drive.
- Bars over the period, daily within a month and monthly otherwise. **Miles and
  dollars are both on every bar**, miles sizing it and the deduction under them.
  They were behind a Miles/Dollars toggle for a while; a toggle makes you click
  to compare two readings of one fact.
- **By weekday** below a divider: seven rows, day, bar, miles, dollars, busiest
  in dark. A seven-column version was tried and reverted — it was a third of the
  height and unreadable to anyone seeing it for the first time.

The car, always measured **since 1 January 2026** (`CAR_EPOCH`) rather than the
selected period, because what the driving deducts against what the car swallows
is a cumulative question that a single month would swing on one repair bill:

- Deducted · **Spent on the car** · the balance between them, which is coloured:
  red and labelled "Out of pocket" when the car costs more than the miles
  deduct, green and "Left over" when it does not. The total is the headline and
  a breakdown line under it names what the total is made of (Fuel, Repair,
  Maintenance…), so no figure has to be added up in the head or hunted for
  elsewhere.
- A bar putting total car spend inside total deduction, red once it overruns.
- Cost per mile over twelve months.

Fuel is computed from miles ÷ mpg × pump price, which is why those two numbers
are worth entering. Hand-logged `Fuel` rows stay in the ledger as a record of
actual spend but are excluded from the total, or the same gallons would count
twice.

Imported months, behind the disclosure at the bottom, are one 70px row each —
month, owner, trips, miles, deduction, YTD. They were 120px-minimum cards with
reserved sub-rows. "Vs previous" was dropped from them: a month-on-month delta
on an import record answers nothing the chart above does not. Expanding a month
lists its versions, each with CSV, Owner and **Delete**; deleting cascades to its
trips, and if the deleted version was the live one the newest survivor is
promoted, so a month is never left with rows in the table and nothing active.

**No prose verdicts.** An earlier version led with a tinted sentence telling the
reader what to conclude — "replacing this one would likely pay for itself",
"drive it into the ground". It was removed and must not come back: the figures
go up, the reader draws the conclusion. Nothing on this page asserts one.

Also gone, and deliberately: a table of individual drives, a repairs-vs-last-year
block (the cost-per-mile chart already carries repairs), and a replacement
price comparison. And "kept per mile", which subtracted running cost from the
IRS rate as though the rate were income — it is a deduction, worth rate × a tax
bracket, so that number overstated the car by roughly the inverse of the bracket.
`CarEconomics` exposes no net figure at all.

Entering the car's numbers happens in **Profile**, not here
(`components/VehicleSettingsCard.tsx`, admin only): fuel economy, pump price, and
the cost ledger. It is setup, done a few
times a year; Mileage is opened to read totals. Notes on already-logged costs are
editable in place — the note most likely to need fixing is one written months
ago. Dates use `DateField`, never a bare `<input type="date">`, which renders the
browser's own picker instead of the app's.

The car is the household's, like every other table. Its costs are one ledger
that cannot be split per driver, so the block reads **every** trip regardless of
the driver filter above. Dividing shared costs by one person's miles produced
"the car takes 1039% of the deduction" when the true figure was 112% — shared
costs have to meet shared miles. `vehicle_profiles` is read as a singleton (most
recently updated row) and the settings card updates that row in place, so a
second admin editing cannot open a rival car alongside the first.

### Clients Section

- Added `/clients`.
- Added client list with Active / Paused / All filters and counts.
- Added client cards showing:
  - Client name.
  - Pet names.
  - Pet type icons.
  - Payment method badge.
  - Estimated monthly earnings with a compact `/mo` period label.
  - Owner label showing whose client it is.
- Client card behavior:
  - Paused clients render with a muted/greyed-out style so they are obvious in the All view.
  - In the All filter, Active clients sort first and Paused clients sort at the bottom.
  - Active and Paused tabs keep their existing name-based ordering.
  - Delete icon appears only for Paused clients.
  - Active clients cannot be deleted from client cards.
  - Paused cards do not translate/lift on hover, so the delete icon stays still.
- Added add/edit client slide-over form.
- Add/edit client slide-over closes from both the X button and clicks on the dimmed overlay outside the panel.
- Added dynamic pets list.
- Redesigned the Pets section:
  - New clients start with no pet rows.
  - Default state shows only a secondary `Add pet` button, with no empty Pets container.
  - Clicking `Add pet` adds a pet card with Pet name, Type, photo upload, and remove controls.
  - Multiple pets can be added.
  - The last pet can be removed, returning the section to the empty `Add pet` state.
- Added pet type selector: Dog, Cat, Bird, Exotic.
- Added optional pet photo upload using the planned `pet-photos` Supabase Storage bucket.
- Added payment methods: Rover, Venmo, Cash.
- Added tax/commission logic:
  - Cash is non-taxable.
  - Venmo and Rover are taxable.
  - Rover applies a 20% commission.
  - Commission rate lives in `ROVER_COMMISSION_RATE` in `lib/clients.ts`.
- Added day-of-week visit selector:
  - Mon, Tue, Wed, Thu, Fri, Sat, Sun.
  - Selected days are highlighted in gold.
  - Weekly visit count is calculated from selected days.
  - Earnings estimates use selected days per week.
  - New clients now start with no visit days selected.
  - Empty state hint says `Select visit days.`
  - Visit days are required on submit; missing days show a danger border and `Select at least one visit day`.
- Removed the old free-text frequency field and quick-pick chips.
- Added fixed-height earnings estimate cards so numbers do not shift or jump.
- Updated Add Client form layout:
  - Name and Address are stacked vertically.
  - Address is full width on its own row.
  - Address field height matches the Name input.
- Added required-field validation:
  - Name is required.
  - Address is required.
  - At least one pet is required.
  - Each pet must have a name and type.
  - Payment method is required.
  - Price per visit must be greater than $0.
  - Visit days are required.
  - Error messages appear directly below their related fields/actions.
- Updated Edit Client save flow:
  - Edit mode primary button says `Update client`.
  - New client mode still says `Add client`.
  - Clicking `Update client` opens a confirmation modal instead of saving immediately.
  - The modal lists each changed field with old and new values.
  - Modal actions are `Confirm changes` and `Cancel`.
  - `Cancel` returns to editing without losing changes.
  - `Confirm changes` saves the update.
  - If no values changed, the form shows `No changes to update.`
  - Editing preserves the original client owner instead of reassigning it to whoever saved.

### Client Database

- Added `supabase/clients-schema.sql`.
- Schema includes:
  - `clients` table.
  - `pets` table.
  - Admin-aware RLS policies.
  - Indexes for client status/name and pet ownership.
- Supabase Storage bucket still needs to exist manually:
  - `pet-photos`

### Shared Books, Admin Settings

Everyone signed in sees and edits everything. `user_id` is still stamped on every
row, but it now answers "who logged this" — navigation, not permission.

Why: two people keeping one set of books were each shown half of it. The year's
deductible total is a household number, and the person who drove the miles could
not see what the miles came to. Splitting reads by owner made the app worse at
its only job.

- `supabase/shared-access-schema.sql` is the migration. Every data table gets one
  policy, `for all to authenticated using (true) with check (true)`. It drops
  existing policies **by lookup** rather than by name, because these tables have
  carried several policy names over the years and a stale owner-scoped policy
  would not block anything (policies OR together) but would misdescribe the
  schema to the next person reading it.
- `profiles` is readable by everyone — that is where owner-label nicknames come
  from. `role` stays privileged: the update policy pins `role = 'user'`, so a
  regular user editing their nickname cannot promote themselves in the same
  statement. Admins pass through the separate permissive admin policy.
- `google_drive_accounts` still has **no policy at all**. It holds OAuth tokens
  and is service-role only.
- `merchant_rules` is shared, and keyed on `match_key` alone rather than
  `(user_id, match_key)`. One household, one business, one answer to "is Chewy a
  business expense" — teaching it once holds for whoever reviews next month.
  `user_id` still records who decided last. The migration collapses the
  duplicates the old per-user key allowed, keeping the most recent decision.
- `payment_cards` is shared and deduplicated by nickname on read. A shared
  statement can contain a charge on the other person's card; offering only your
  own would force it to be filed as Cash. The unique index is still per user, so
  the same nickname can exist twice and the first one added wins.

What `isAdmin` still governs: `profiles.role`, and nothing else. `useAuthUser()`
keeps exposing it, and Profile shows an `Admin` chip. There is no admin-only
read, no admin-only delete, and no admin-only owner reassignment any more.

- `/api/users` replaced `/api/admin/users` and `/api/admin/user-labels`. One
  route, authenticated but not role-checked, returning every user by display
  name. Both old routes were the same query behind the same service-role client;
  the label variant only existed to avoid handing non-admins a list of names,
  which is no longer a thing worth avoiding.
- `lib/userLabels.ts` is the only client-side caller: `loadUsers()` for owner
  pickers, `loadUserLabels()` for id→name maps, `labelFor()` for a single row.

### One Drive for the whole app

There is exactly one Google account — the admin's — and every receipt archives
into it, whoever uploaded the file. Per-person Drives would scatter a year's
proof across two accounts and leave neither complete, which is the wrong shape
for the one moment it matters.

- `archiveAccountUserId()` in `lib/receiptArchive.ts` resolves it: the admin who
  has actually connected, falling back to the first admin so "not connected"
  still reads correctly. `resolveArchiveTarget(admin)` takes no user id at all
  any more.
- `sync`, `refile` and `discard` all archive into that account. A backlog drain
  covers **everyone's** pending receipts, so the "waiting to archive" counts on
  Transactions and Profile are unscoped — one Sync clears the lot.
- Connecting, choosing the folder and disconnecting go through
  `authenticateAdmin()` in `lib/serverAuth.ts` — they change the account itself.
  `status` stays open to everyone: seeing "filing into <folder> · <admin email>"
  is how the other person knows their receipts land somewhere real.
- `DriveArchiveCard` takes `isAdmin`. Everyone gets Sync now; only an admin gets
  Connect, Change folder and Disconnect.

Still true, and unchanged:

- `profiles` table, `is_admin()`, `handle_new_user_profile()`, and the
  `on_auth_user_created` trigger.
- Nicknames: `Ivan K. (Admin)` and `Yani`. Owner labels prefer the nickname and
  fall back to email.
- Signup goes to `/onboarding` for a nickname; login does not.
- New tables should carry `user_id uuid references auth.users(id) on delete
  cascade` for attribution, and this policy shape:

```sql
create policy "Shared workspace" on <table>
  for all to authenticated
  using (true) with check (true);
```

### Google Drive Receipt Archive

- Receipts are mirrored into the Drive folder chosen through the Google Picker.
- Folder layout is `<chosen folder>/<Year>/<MM Month>/<file>`, e.g. `2026/06 June`.
  Folders are find-or-create by name, so re-syncing never duplicates them.
- The Picker needs `GOOGLE_PICKER_API_KEY` — an API key with the **Google Picker
  API** enabled, in the same Cloud project as the OAuth client. The Maps key does
  not work; Google rejects it with "The API developer key is invalid."
- The Picker app id is derived from the OAuth client id's project number. With
  the `drive.file` scope this is what grants the app access to a picked folder.
- Archive lifecycle:
  - Saving a transaction archives its receipt automatically, scoped to that one
    receipt via `POST /api/receipts/sync` with a `receiptId`.
  - Changing a transaction's date to another month re-files the receipt through
    `POST /api/receipts/refile`, which moves the Drive file and restamps
    `receipts.period_month`. The file id and share link survive the move.
  - Deleting a transaction, detaching a receipt, or replacing one retires it via
    `POST /api/receipts/discard`: the Drive file is **trashed** (recoverable for
    30 days, never hard-deleted), the Storage object is removed, and the row is
    deleted.
  - Retirement only happens on a successful save, so closing the slide-over
    without saving leaves Drive untouched.
  - Archive steps are non-fatal: the expense is saved first, and Drive failures
    are recorded on `receipts.drive_error` and surface as "Waiting to archive".
- The manual Sync button still drains the full backlog and is the retry path.

### Statement Import

The primary way transactions get into the books. Lives at `/import`, as a third
Expenses sub-tab next to Expenses and Reports, backed by
`supabase/statement-import-schema.sql`.

Flow:

1. The user drops a bank or card statement PDF on `/import`.
2. `POST /api/statements/parse` reads it and returns a reviewable list.
3. The user goes through the list — every row is Include, Flag, or Not business,
   and every field is editable in place.
4. Confirming writes the Included rows into `expenses` and remembers the
   decisions for next month.

Accuracy over speed, deliberately:

- `lib/statementExtraction.ts` runs **two** model passes over the same PDF. Pass
  one extracts; pass two re-reads the document holding pass one's output and
  returns a corrected list. The audit pass wins.
- Both passes are pinned to a JSON schema via `output_config.format`, so the
  response is always parseable — there is no bad-JSON retry path.
- `reconcile()` in `lib/statementImports.ts` sums the extracted debits and
  compares them against the total the statement prints on itself. The result is
  shown to the user as "Totals match" / "Totals do not match" / "nothing to check
  against" rather than assumed correct.
- Default model is `claude-haiku-4-5` — cheap, and the passes plus the
  reconciliation are what buy the accuracy. Override with
  `TRANSACTION_PARSER_MODEL`.
- The route is `runtime = "nodejs"` with `maxDuration = 300`. Two passes over a
  multi-page PDF take a minute or more; the dropzone walks through progress copy
  rather than showing a bare spinner. Vercel must allow that duration.

Review behaviour:

- Rows live in `statement_import_rows`, not a jsonb blob, so a half-finished
  review survives a refresh or a different device. Every edit persists on change.
- Each row carries date, amount, merchant, category, note, and an invoice
  attachment with an attached/missing indicator. Invoices reuse `uploadReceipt`
  and the existing Drive archive — they are refiled and synced on import.
- Credits (money in) are pre-set to Not business, since they are never
  deductible, but stay visible so refunds are easy to spot.
- Rows the scan already answered — credits, and both halves of a refund pair —
  are grouped into a **Set aside** section below the list rather than left in
  amongst the rows that still need a decision. A statement that opens with a run
  of credits otherwise buries the real work below the fold.
  - Membership is by what a row *is*, not what it is currently set to, so a row
    does not jump sections when the user overrides its decision.
  - The section is collapsible and open by default: these rows were decided by a
    rule, and a tax review is the wrong place to hide that behind a click.
  - Each refund pair renders as one tinted block, charge above its credit, so
    the two halves read as a single event instead of adjacent coincidences.
  - The grouping is recomputed client-side from `refundPairIndexes()`. It is a
    pure function of the rows, so it needs no column and cannot go stale against
    edits made during the review.
- Refunded charges are detected at scan time by `refundPairIndexes()` in
  `lib/statementImports.ts`. A charge and a same-amount credit from the same
  payee, within 120 days, are a wash — both sides are pre-set to Not business
  and both carry a note naming the other. Matching needs the amount **and** the
  merchant fingerprint to agree; amount alone would pair a refund with whichever
  unrelated charge happened to be nearest. Each charge is claimed once, so one
  refund against three identical charges retires exactly one of them.
- Changing a category offers to carry the pick across the other rows from the
  same payee (`SimilarCategoryDialog`). Rows are listed with a checkbox each,
  pre-ticked, and the prompt only appears when a similar row exists whose
  category would actually change. `Just this one` dismisses it.
- The offer follows **every** category edit — the row chip, the expanded row's
  dropdown, and the selection bar's bulk edit. Selecting three of six Chewy rows
  says nothing about the three the user never scrolled to, so the rest are still
  worth asking about.
- `similarCandidates()` in `lib/statementImports.ts` is the single rule both
  surfaces use. It takes a list of targets (one row, or a whole selection),
  excludes the targets themselves, excludes import rows already written to the
  books, and compares categories **normalized** — so a row still carrying an old
  Schedule C heading is never offered as differing from the category it maps to.
- The same offer runs on the Expenses list in `app/page.tsx`, over that month's
  rows. The `ExpenseSlideOver` edit form is deliberately excluded: it is a
  full-record edit behind a Save button, not a quick recategorise.
- Rows the model was unsure about are marked `low` confidence and flagged in the
  list with a warning icon.
- `Add one` appends a `source = 'Manual'` row for cash or anything the statement
  never saw. Manual rows never write merchant rules.
- Import is blocked while an Included row is missing a date, merchant, amount, or
  category — the count of blocked rows is shown above the button.
- Flagged rows are never written to the books. An import only reaches `Imported`
  once no rows are still flagged; otherwise it stays in `Review`.
- Confirming a finished import closes the review screen and returns to the
  transactions list, landing on the month most of the imported rows filed under
  (`inferPeriodMonth` over their dates) rather than whatever month was selected
  — otherwise the books read as empty and the import looks like it did nothing.
- A partial import — flagged rows still undecided — deliberately stays open,
  since there is work left. The rows that did land show an `In your books` badge
  instead of decision buttons, their delete button is hidden, and bulk actions
  skip them: their decision is settled, and editing them here would go nowhere
  (or, for delete, orphan the expense).

Merchant memory (`merchant_rules`):

- Confirming an import upserts one rule per decided row, keyed on
  `merchantMatchKey(description)` — a fingerprint with card numbers, store ids,
  and POS noise stripped, so "SQ *CHEWY 4417" and "SQ *CHEWY 9902" match.
- The next import pre-fills category and Include/Exclude from those rules and
  marks the row `auto_applied` (a sparkle icon in the list).
- Flagged rows deliberately write no rule — "not sure" is not worth replaying.
- Rules are shared, keyed on the fingerprint alone. A merchant categorised once
  comes back pre-filled on the other person's statement too — the books are one
  set, so the memory behind them is one set as well.

### House Sitting Section

- Lives inside the Clients tab as a separate view, backed by `supabase/house-sitting-schema.sql`.
- Tables are `house_sittings` and `house_sitting_customers`.
- Calendar supports week, month, and year views.

Responsive behavior (mobile-first):

- All three calendars use a real `grid-cols-7` at every breakpoint. They must never collapse to a single column.
- Below `lg` (1024px), day cells show colored dots per stay instead of text pills, and tapping a day opens a bottom day sheet.
- At `lg` and above, day cells show the full text pills and the mobile tap overlay is hidden.
- Dot color follows payment method. Cancelled stays render as a ringed grey dot.
- Week view adds a "Stays this week" agenda list below the strip on small screens only.
- Year view is a 2-up card grid on phones; tapping a month card jumps to that month in month view.
- The mobile tap overlay is an absolutely positioned `lg:hidden` button so desktop pills never end up nested inside another button.

Cancel and delete:

- `house_sittings.status` is `'Planned'` or `'Cancelled'`, defaulting to `'Planned'`.
- Cancelling keeps the stay visible everywhere, greyed out with a `Cancelled` chip and strikethrough.
- Cancelled stays are excluded from booked nights, year net, upcoming counts, and next-stay stats.
- Cancelled stays can be restored back to `Planned`.
- Deleting permanently removes the row and cannot be undone.
- Both actions are available from the edit slide-over and from each row in the day sheet.
- Both actions route through `components/ui/ConfirmDialog.tsx` rather than `window.confirm`.
- Reads normalize any unexpected status value to `'Planned'`.
- Inserts and updates never send `status`, so the database default and the cancel/restore action stay the only writers.
- If the `status` column is missing, cancel/restore surfaces a message telling the user to run `supabase/house-sitting-schema.sql`.

### Profile Section

- Added `/profile`.
- Shows user email.
- Shows app version.
- Includes sign out button.
- Leaves space for future settings.

### Address Autocomplete

- Added `components/AddressAutocomplete.tsx`.
- Added Google Places address autocomplete to the client address field.
- Uses the current browser-side Google Places API pattern:
  - `google.maps.importLibrary("places")`
  - `AutocompleteSuggestion.fetchAutocompleteSuggestions`
- Uses the existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` from `.env.local`.
- Address placeholder is `Search by address or building name`.
- Autocomplete search is no longer restricted to street-address/premise types, so it supports building names, apartment names, landmarks, and other places.
- Suggestions are enriched with Places `displayName` and `formattedAddress`.
- Dropdown rows show two lines:
  - Place/building name.
  - Smaller gray formatted address.
- Selecting a suggestion writes the formatted address into the form.
- Selecting an address closes the dropdown and prevents it from immediately re-opening with the same selected address.
- Existing saved addresses in the Edit Client form do not trigger autocomplete on form load.
- Autocomplete lookup only starts after the user actively types in the address field.
- Verified Google Places previously returned suggestions from `http://127.0.0.1:3000`; current local app also runs on `http://localhost:3000`.

## Important Files

- `app/page.tsx`: Expenses page.
- `app/reports/page.tsx`: Reports — the year's deductible total, spend and mileage.
- `app/mileage/page.tsx`: Mileage — miles, month-over-month, deduction against car spend.
- `components/SectionTabs.tsx`: The three Deductions tabs.
- `lib/mileage.ts`: Trip loading and the helpers Mileage/Car/Reports share.
- `lib/vehicle.ts`: Fuel from miles, cost per mile, deduction alongside spend.
- `components/VehicleSettingsCard.tsx`: Car setup and the cost ledger, in Profile.
- `supabase/vehicle-schema.sql`: `vehicle_profiles` and `vehicle_costs`.
- `app/import/page.tsx`: Statement import — dropzone, review list, confirm.
- `app/api/statements/parse/route.ts`: Reads an uploaded statement PDF into rows.
- `lib/statementExtraction.ts`: The two model passes and their JSON schemas.
- `lib/statementImports.ts`: Merchant fingerprinting, reconciliation, row validation.
- `lib/statementImportClient.ts`: Browser-side import queries, confirm, merchant memory.
- `components/expenses/StatementDropzone.tsx`: PDF drop target and scan progress.
- `components/expenses/ImportRowCard.tsx`: One reviewable transaction.
- `components/expenses/PaymentMethodPicker.tsx`: Cards by nickname — pick, add, remove.
- `lib/paymentMethods.ts`: The card list, and what the picker offers.
- `supabase/payment-cards-schema.sql`: `payment_cards` table, RLS, and the seed.
- `app/api/receipts/proof-sheet/route.ts`: Reads a vendor report and proposes the
  transactions it proves. Writes nothing.
- `lib/spreadsheet.ts`: Dependency-free `.xlsx`/`.csv` reader; grid preview for the model.
- `lib/proofSheets.ts`: Reads charges out of the grid, and the matching rules.
- `lib/proofSheetExtraction.ts`: Column mapping (spreadsheets) and transcription (PDFs).
- `lib/proofSheetClient.ts`: Browser-side scan, then upload-and-attach on confirm.
- `components/expenses/ProofSheetReview.tsx`: Confirming what a report proves.
- `lib/anthropicJson.ts`: The shared schema-pinned model call.
- `components/expenses/CategoryPicker.tsx`: Category sheet — close button, and
  the row's current category shown above the list.
- `components/expenses/SimilarCategoryDialog.tsx`: "Apply this to the other
  Chewy rows too?" after a single category edit.
- `components/expenses/ImportSummaryCard.tsx`: Totals cross-check banner.
- `supabase/statement-import-schema.sql`: Import, row, and merchant-rule tables.
- `app/clients/page.tsx`: Clients section.
- `app/api/users/route.ts`: Everyone signed in, by display name.
- `lib/userLabels.ts`: The client side of that route.
- `supabase/shared-access-schema.sql`: Shared-access RLS for every table.
- `app/onboarding/page.tsx`: Post-signup nickname onboarding screen.
- `app/login/page.tsx`: Sign-in/sign-up entry point.
- `app/profile/page.tsx`: Profile section.
- `components/AppShell.tsx`: Desktop sidebar and mobile bottom nav.
- `components/ClientForm.tsx`: Add/edit client form.
- `components/AddressAutocomplete.tsx`: Google Places address autocomplete.
- `components/ClientCard.tsx`: Client card UI.
- `lib/useAuthUser.ts`: Auth user and profile role loading.
- `lib/clients.ts`: Client constants and earnings calculations.
- `types/client.ts`: Client and pet TypeScript types.
- `supabase/clients-schema.sql`: SQL for client/pet tables.
- `supabase/schema.sql`: Expenses schema plus profiles table, helper functions, and triggers.

## Verifying UI Changes

The dev server is behind Supabase auth, so an unauthenticated request only proves
a route returns 200. Anything that renders must be checked signed in, against
real data — twice, "compiles and serves clean" has hidden a bug that was obvious
on screen.

No password is needed, and none should ever be typed. From a throwaway script in
the project root (module resolution fails outside it), read `.env.local`, then:

1. Service-role client → `auth.admin.generateLink({ type: "magiclink", email })`.
2. Anon client → `auth.verifyOtp({ token_hash: link.properties.hashed_token,
   type: "magiclink" })`, which returns a real session.
3. Write `{ key: "sb-<project-ref>-auth-token", session }` to
   `public/devsession.local.json`; in the browser pane
   `fetch("/devsession.local.json")` then `localStorage.setItem(k, v)`. Serving it
   same-origin keeps the token out of the transcript. The browser pane refuses
   external hosts, which is why the token is exchanged server-side rather than by
   opening Supabase's verify URL.
4. Navigate to the page and read it back.
5. **Delete the script and `public/devsession.local.json` immediately** — they
   hold a live refresh token and must never be committed.

## Verification Completed

These checks have passed after the latest changes:

```bash
npm run typecheck
npm run lint
```

The dev server was restarted cleanly and responds at:

```text
http://localhost:3000
```

For Google Places autocomplete testing, use:

```text
http://localhost:3000
```

## Git Workflow

Project path:

```text
/Users/Shared/Codex/Sviy Hub
```

Use `staging` as the default working branch. All normal commits go to `staging`, which deploys automatically to the Vercel preview environment. The repository-local Git default branch and default push ref are both `staging`, and `origin/HEAD` should point to `origin/staging`.

After every completed task, automatically commit and push all changes to `origin/staging` without waiting for manual approval. Normal changes should follow this flow:

```bash
npm run typecheck
npm run lint
git status
git add <files>
git commit -m "<message>"
git push origin staging
```

The repo uses `core.hooksPath=.githooks`. The `post-commit` hook automatically pushes commits made on `staging` to `origin/staging`; commits on other branches are not auto-pushed by the hook.

`staging` deploys to the protected Vercel preview URL:

```text
https://sviy-hub-git-staging-ivan-k-s-projects.vercel.app/
```

Only deploy production when explicitly told `push live`. To do that, merge the tested `staging` branch into `main` with a promote commit, push `main` to `origin`, and then return the local workspace to `staging`:

```bash
git checkout main
git merge --no-ff staging -m "Promote <summary> to live"
git push origin main
git checkout staging
```

`main` carries promote merge commits from every past deploy, so it structurally diverges from `staging` and `git merge --ff-only` will always fail. Use `--no-ff` and do not try to force a fast-forward, rebase `main`, or reset either branch.

Before merging, confirm `main` holds no unique content — the promote commits should be merges only:

```bash
git diff staging..main --stat
```

That diff should show only staging's newer work in reverse. If it shows changes that exist nowhere on `staging`, stop and ask before merging.

The promote commit message is the production changelog entry. Summarize the user-facing changes being shipped, not the individual staging commits.

`main` deploys to the production URL:

```text
https://sviy-hub.vercel.app
```

Do not commit normal task work directly to `main`, and do not treat requests to `commit and push` as production deployment unless the user explicitly says `push live`.

## Versioning Rules

Always update and report the app version at the end of each completed task. Version numbers use:

```text
major.feature.patch
```

- Change the first number only for structural app-wide changes, such as a new sidebar-level product area, core navigation model change, or a crucial shift in the overall app logic.
- Change the second number for major feature additions inside the current structure, such as a new analytics section, complex reporting block, or a substantial new workflow inside an existing tab.
- Change the last number for fixes, UI polish, copy updates, and other minor changes.
- When the first or second number changes, reset the last number and start the new version line at `.1`. For example, moving from `3.1.x` to `3.2.x` should land as `3.2.1`.

The repo pre-commit hook always increments the last number in `version.json` and stages it automatically. When setting a structural or major-feature version before commit, account for that hook so the committed version still follows the intended version family.

## Expense Categories

The app uses nine categories, ordered most-used first, defined in
`lib/categories.ts` as `EXPENSE_CATEGORIES`:

Transportation, Supplies, Software & Apps, Insurance, Professional Services,
Meals, Phone & Communications, Home Office, Miscellaneous.

This replaced the full 22-item Schedule C list. Rules:

- `normalizeCategory()` maps any old Schedule C value onto a current one, so
  rows written before the change still read correctly. Every list, report, and
  select normalizes on read — never compare a raw stored `category` string.
- Unrecognised values fall back to `Miscellaneous` rather than being dropped, so
  nothing silently disappears from a tax total.
- Tag colours are fixed per category in `lib/categories.ts`, not hashed. Each
  category owns a distinct hue — the first palette was nine near-identical
  neutrals that were impossible to tell apart in a list.
- `CategoryTag` takes `fixedWidth` for use inside transaction lists, where the
  column must not resize per row.

## Next Step

Run `supabase/shared-access-schema.sql` in Supabase. It is re-runnable. It
rewrites RLS on every table so both accounts see and edit the same books, and
re-keys `merchant_rules` on the merchant alone. Until it runs, the app asks for
everyone's rows and the database returns only your own, so the pages look right
but the totals stay half-sized.

Then run `supabase/vehicle-schema.sql` in Supabase. It is re-runnable and creates
`vehicle_profiles` and `vehicle_costs`. Until it runs, the
Car tab loads but shows a setup notice instead of saving anything.

Then run `supabase/payment-cards-schema.sql` in Supabase. It is re-runnable, creates
`payment_cards`, and seeds it from the payment methods already on each person's
transactions. Until it runs, the payment picker falls back to Main card / Other
card / Cash and saving a new card reports that the table is missing.

Run `supabase/category-migration.sql` in Supabase to rewrite stored categories
onto the nine above. It is re-runnable and covers `expenses`,
`statement_import_rows`, and `merchant_rules`. The app works before and after
it runs; running it just makes the stored data match what is displayed.

Then run `supabase/statement-import-schema.sql` in Supabase. It is re-runnable and
creates `statement_imports`, `statement_import_rows`, and `merchant_rules`, plus
the `expenses.statement_import_id` column. Until it runs, `/import` shows a setup
notice instead of the dropzone.

Then test the statement import end to end:

1. Open `/import` and drop a real bank statement PDF.
2. Confirm the totals banner says the extracted total matches the statement.
3. Spot-check a few rows against the PDF — dates, amounts, and directions.
4. Set one row to Flag and one to Not business.
5. Attach an invoice to a row and confirm the indicator flips to `Invoice ✓`.
6. Add a manual transaction with `Add one`.
7. Import, and confirm the rows land in the Expenses tab under the right month.
8. Import a second statement from the same account and confirm the merchants you
   already categorised come back pre-filled with a sparkle icon.

Then run `supabase/house-sitting-schema.sql` in Supabase. It is re-runnable and adds the `house_sittings.status` column that cancel/restore needs. Until it runs, the calendar still loads and delete still works, but cancelling shows a message asking for this migration.

Then create the private Supabase Storage buckets if they do not exist yet:

```text
receipts
pet-photos
```

The project had no `receipts` bucket, so every receipt upload — the slide-over,
the quick attach, and `Use as proof for N transactions` — failed with
`Bucket not found`. It was created (private) on 17 August 2026; the shared
storage policies in `supabase/shared-access-schema.sql` already covered it.

Then test the full client workflow in the browser:

1. Open `http://localhost:3000`.
2. Log in.
3. Go to Clients.
4. Add a client.
5. Type a building name such as `NV Apartments` and confirm Google suggestions appear.
6. Confirm suggestions show place/building name plus formatted address.
7. Select a suggestion and confirm the dropdown closes.
8. Add at least one pet.
9. Select visit days.
10. Confirm missing required fields show errors directly below the relevant field/action.
11. Confirm earnings update correctly.
12. Save the client.

Also test permissions with both users:

1. Log in as Ivan and note the client list, the year's deductible total, and the mileage total.
2. Log in as Yana and confirm all three numbers match exactly.
3. Confirm every client card, import, and stay is labelled with whose it is, for both accounts.
4. As Yana, edit one of Ivan's transactions and confirm it saves.
5. Confirm Profile shows the `Admin` chip for Ivan and not for Yana.
6. As Yana, confirm Profile shows the Drive archive folder and a Sync button, but no Connect/Change folder/Disconnect.
7. As Yana, attach a receipt and confirm it lands in Ivan's Drive folder for that month.

Also test client-card/edit behavior:

1. Confirm Active clients do not show a delete icon.
2. Confirm Paused clients show a delete icon.
3. Confirm hovering Paused cards does not move the delete icon.
4. Edit an existing client and confirm `Update client` opens the change summary modal.
5. Confirm `Cancel` returns to editing and `Confirm changes` saves.

If autocomplete does not work on `localhost`, update the Google Cloud key referrers to include `http://localhost:3000/*`.
