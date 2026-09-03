# Sviy Hub Project Context

## Project Overview

Sviy Hub is a private, single-user family CRM and business tracker for a small pet-care business. It started as an expense tracker and is now being expanded into a polished, native-feeling app for managing clients, pets, income estimates, profile/account details, and Schedule C-ready expense reporting.

The app should feel calm, premium, warm, and consumer-grade. The design direction is soft off-white backgrounds, warm gold accents, generous whitespace, rounded corners, subtle shadows, and comfortable mobile-first tap targets.

## The branch rule — read this before the first command

**Never create a branch on this project. Every change goes straight to
`staging`, and it is pushed to `origin/staging` the moment it is done.** This is
a must, not a preference, and it holds in every session, every conversation, and
every environment — including remote ones that hand you a `claude/...` branch
name in their setup instructions. That name is the harness talking, not Ivan; if
a session starts you on one, commit the work and push it to `staging` anyway, and
say that is what you did.

Why it is written at the top: work committed to a side branch does not deploy.
Ivan reviews on the `staging` preview, so a feature branch means he opens the
preview, sees the old app, and the work may as well not exist. It has happened,
and the failure is silent — the commit looks finished from this side.

`main` is production and is touched **only** when Ivan types `push live`. Nothing
else promotes it: not "commit and push", not "ship it", not a task being
finished. The full promote flow is in `## Git Workflow` at the bottom of this
file.

So, in one line: **branch never, `staging` always, `main` only on `push live`.**

## Before you ship any screen — the gate

The rule below has been written down for a long time and has still been broken on
almost every new screen, so it is now a checklist rather than a principle. Ivan has
asked for this roughly twenty-five times. Reading the rule is not applying it.

Answer these before writing layout, and again before committing:

1. **Did I stack cards?** More than two top-level cards on a screen is a failure.
   Related blocks go in **one** container split by `border-t`. Six sections means
   six rows in one card that expand, not six cards.
2. **Is every row using its full width?** A card spanning the screen with its
   content in the left 10% is the single most-named failure. Numbers go where the
   space is — a divided strip across the row, not a left-hugging block.
3. **Did I spend a permanent row on navigation?** A full-width segmented bar for
   two tabs is not navigation, it is 48px of tax on every visit. Rare
   destinations are a small control in the header, or a stage you drill into.
4. **Can the answer be read without scrolling?** If the screen's whole point is
   below the fold on a 390×700 phone, the layout is wrong however tidy it looks.
5. **Is anything collapsed that should be, or expanded that should not?** Entry
   forms, history and setup collapse. What the page exists to show never does.
6. **Did I measure it at 390px?** Not "does it compile" — the rendered geometry,
   with a screenshot read back.

If a screen fails any of these, it is not finished, and shipping it and offering
to polish later is not an option.

## Space and Navigation — the standing rule

This comes up on almost every task, so it is written here rather than repeated
in chat. It applies to every screen, before the first line of layout is written.

**Vertical space is the scarcest thing on the page.** The app is used on a phone,
where roughly 700px decides whether a number is seen or scrolled past. Chrome —
headers, borders, padding, empty labels — is what pushes the answer below the
fold, and it is never worth its cost.

The rules that follow from that:

- **One row of navigation per level, and never two segmented rows stacked.**
  If a screen needs both a "who" and a "what" switch, they share a line: the
  question that changes rarely gets a compact pill group, the one being flipped
  through gets the rest of the width.
- **No heading that repeats the tab you are on.** A panel called "Weight" inside
  the Weight tab is a wasted 40px that tells the reader nothing.
- **One card per screen, divided — not a stack of cards.** Each card costs a
  border, a shadow, a title and two lots of padding. Related blocks belong inside
  one container separated by `border-t`, the way the Mileage car block already does.
- **Entry forms collapse; readings do not.** A page is opened to read a number
  ten times for every once it is typed into. Log forms, setup fields and goal
  editors sit behind a disclosure or appear only while their value is unset. What
  the page exists to show is never behind a click.
- **Stats go in a divided strip, not in a grid of cards.** `StatStrip` + `Stat`
  is the house pattern: three numbers, one set of chrome.
- **No reserved-but-empty rows.** A detail line, a delta, a sub-label that is
  blank half the time should not hold its space when it has nothing to say.
- **Nothing is stated twice.** The sidebar names the section, the tab row names
  the page. A third label on the content is noise.

**But shrinking chrome is the last move, not the first.** Smaller buttons and
tighter padding are what you do once the structure is right; reaching for them
first is how a screen ends up dense *and* still wrong. Start instead by asking
what actually happens on this screen:

1. **Count the visits, not the features.** List what the user comes here to do
   and how often. On Health it is: weigh in (most days), glance at the trend
   (often), tape measure (weekly), set a goal or a height (once). Frequency, not
   the tidiness of the taxonomy, decides what gets the top of the screen.
2. **The most frequent action should cost one tap, and no navigation.** If the
   daily job is behind a tab, a disclosure and a Save button, the layout is
   wrong however compact it looks.
3. **Prefer a stage over a row.** Navigation that is on screen permanently is
   paid for on every visit, even by the nine visits in ten that never use it.
   An overview that drills into a subject on tap — with a back arrow to return —
   costs nothing until it is wanted. A small control that opens the full set of
   options (a sheet, a picker, a popover) beats a row of controls sitting there
   all day.
4. **Let state do the talking.** A card that is an input until today's number
   exists, and the number afterwards, answers "have I done this yet?" without a
   label, an empty state or a badge.
5. **Two honest things beat three padded ones.** Do not add a third tile, tab or
   stat to balance a grid.

If a screen ends up needing more chrome than this allows, the screen is doing
too much — split what it answers, do not add height.

**Motion**: nothing scales — not on press, not on hover. The global rule in
`globals.css` was `button:active { transform: scale(0.97) }`, which is fine on a
pill and wrong on anything larger: a tile inside a bordered card kept its border
while its contents shrank away from it, flashing white gutters down both edges,
and the text went soft mid-scale. **Press is `opacity: 0.72`** — it moves no
geometry, so a chip and a full-width card press identically. Panels and menus
travel a few pixels and fade (`.sheet-panel`, `.slide-over-panel`,
`.popover-panel`, 140–200ms `ease-out`, all off under `prefers-reduced-motion`).
Everything else responds in colour: `transition-colors duration-200 ease-out`.
If a new interaction seems to want a transform, it wants a colour or an opacity
change instead. There is no hover lift left anywhere — the client cards deepen
their shadow instead of rising, so a card never pulls its own delete button out
from under the cursor.

**The one exception, and its fence.** The mobile tab bar's selection pill
(`components/MobileTabBar.tsx`) scales: it stretches along its direction of
travel while being dragged, thins slightly across it, and springs back. Ivan
asked for the bar to feel like Apple's, and squash-and-stretch is most of what
makes that read as liquid rather than as a rectangle sliding; the request was
explicit, so the exception is deliberate rather than a rule quietly broken.

It is safe *there* for the reason the rule exists everywhere else: the scar
behind the rule is a tile **inside a bordered card**, which kept its border
while its contents scaled away from it. The pill carries its own ring and its
own background and has nothing hugging it, so it deforms as one object and no
gutter can open. Measured at 390/430/440: peak scale 1.14 × 0.92, and its
closest approach to the bar's inner edge is 3.7px, so it never breaks out of
the glass it sits in.

The fence: this element, driven by a finger, and nothing else. It does not
license a press-scale, a hover lift, or a scale on anything that sits inside
another bordered container. A new interaction that wants a transform still
wants a colour or an opacity change instead.

**A control that changes what you are looking at shows you the options.** No
blind toggles: tapping the person avatar opens the list of people, it does not
silently swap to the other one. Cycling makes the reader check the screen
afterwards to find out what happened.

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
  - Four sections: Taxes, Clients, Health, Profile.
- Added safe mobile bottom padding so content does not sit under the tab bar.
- Strengthened the visual system with warmer backgrounds, larger form controls, softer shadows, and more rounded cards.

### Taxes Section

Everything that lowers the tax bill is one nav item — **Taxes** — with three
tabs across the top (`components/SectionTabs.tsx`). It was called Deductions
until the nav grew a fourth item; "Taxes" is what the section is for, and it
reads at a glance in a four-up mobile tab bar where the longer word did not:

| Tab | Route | Question it answers |
| --- | --- | --- |
| Transactions | `/`, `/import` | What did we spend? |
| Mileage | `/mileage` | What did we drive, and what does the car take back? |
| Reports | `/reports` | What does the year come to? |

`/car` redirects to `/mileage`.

Spending and driving are the same deduction asked twice, so splitting them
across top-level tabs meant nobody could see the year's real number in one
place. `TAX_ROUTES` in `AppShell` keeps all five routes lighting the same
nav item.

All four routes carry the same `Taxes` title (`components/PageHeader.tsx`), with
the tab row under it naming the page. The old `Expenses` h1 was dropped on the
grounds that the sidebar already names the section — true on a desktop, and
wrong on the phone the app is actually used on, where there is no sidebar at all
and nothing said where you were. One `PageHeader` now serves every section, so
Taxes, Clients, Health and Profile all wear the same title at the same scale —
and in the same place, which took two rules: the header row is always 44px tall
whether or not the page has a button in its action slot, and the gap under it
belongs to the header rather than to each page's own `space-y` (which ranged
from 2 to 5). The header therefore sits outside that container. Health's
`DetailHeader` stands in the same slot at the same height, so drilling into Goal
or Body does not nudge the content below.

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
times a year; Mileage is opened to read totals. But Mileage is where you notice
the numbers are missing, so the car block links straight to it —
`Add car data` / `Edit car data` → `/profile#car-settings` for admins, and the
line naming Profile for everyone else. The card carries the `car-settings`
anchor. Keeping the entry in Profile while hiding the way there just made the
setting unfindable. Notes on already-logged costs are
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

### Health Section

`/health`, its own nav item, because it is not the business's books — nothing in
it is shared, added up, or deducted.

**It has no tabs.** It had three, plus a row of person tabs above them, and that
was the wrong shape for how the page is used: nearly every visit is one action —
type this morning's weight — and the rest barely repeat. Two rows of navigation
asking which of three pages you wanted, before a single figure appeared, was a
question the reader answers the same way nine times in ten.

What replaced them:

The overview carries the `Health` title like every other section; a drill-down
replaces it with its own back header rather than stacking two rows.

- **The weigh-in is the page.** `TodayCard` is a number field with the keyboard
  one tap away, and it is the first thing on screen. Enter saves. The card is
  written by its own state: until today has a reading it is an input asking for
  one; the moment it does, it becomes the reading with the change beside it. That
  is also the answer to "have I weighed in yet?", so nothing has to say it.
- **The trend is the row under it** — a sparkline and the 4-week rate — and that
  row is a button into the full weight history.
- **Two tiles, `Goal` and `Body`**, each opening its subject in full (`GoalDetail`,
  `BodyDetail`, `WeightDetail`) with a back arrow to return. Charts, history,
  deletes, height, birth date and the goal editor live in there, one deliberate
  tap away, instead of competing with the daily job. Two tiles, not three: there
  was no honest third.
- **Everything rare is a sheet.** `＋` opens `LogSheet` — date, weight, body fat,
  and the five tape measurements behind one more line — for the weekly measure or
  a day caught up late.
- **The person is context, not navigation.** An avatar in the same row as `＋`
  (`PersonMenu`), so whose readings these are costs no height. Tapping it drops a
  menu of everyone, avatar and name each, with a tick on the current one — never
  a silent swap to the other account. It is not rendered at all when there is
  only one account, and the reading names the person while you are looking at
  someone else's.

So the whole overview is a card and a half, permanent navigation is zero rows,
and the daily action is: open, tap, type, done.

The data is one table, `health_entries`, one row per person per day — a morning
weigh-in and an evening tape measure land on the same row rather than two
half-filled ones, which is what the `(person_id, recorded_on)` unique index is
for. `health_profiles` holds the fixed facts and the goal: height, birth date,
goal weight, target date.

`person_id` — not `user_id` — is the axis. Everywhere else in the app `user_id`
means "who logged this" and the totals are the household's; a body has an owner,
so the column that says whose it is has a different name and `logged_by` keeps
the attribution separately. RLS is still the shared-workspace policy: two people
in one household, either able to type in the other's weigh-in.

Two things it deliberately does not do:

- **The trend is a slope, not two endpoints.** `weeklyRate()` is a least-squares
  fit over the last 28 days. Weight swings a couple of pounds on water alone, so
  first-minus-last reports "gaining" through a month that plainly trended down.
- **No projection off a flat or rising trend.** `projectedGoalDate()` returns
  null unless weight is actually coming down, and the card reads `—`. An arrival
  date computed from a gaining fortnight is a made-up number, and, like Mileage,
  this page states figures rather than asserting conclusions.

An empty input field means "not measured today", never zero — `numberOrNull()`
leaves the last reading standing rather than writing a 0 that would tank every
line on the page.

### Clients Section

**One row of navigation, and the filter is a chip.** Performance / Regular
customers / House Sitting sat above a second segmented row of Active / Paused /
All — two stacked segmented rows, which is the single thing the space rules say
never to do. Measured at 390x844 it cost **108px**, 12.8% of the fold, and the
first figure on the page did not appear until y205: a quarter of the screen
spent before a number. It stayed stacked through **tablet** too, because the two
rows only sat side by side at `lg`.

- The status filter is not navigation — it sits on `Active` almost always — so it
  is a **chip in the page header** (`components/clients/ClientFilterMenu.tsx`)
  reading `Active 5 ⌄`, opening the list with counts and a tick. That header row
  was **empty on a phone**, since `Add client` is a floating button below `sm`.
  It opens the options rather than cycling, and the count beside each answers
  "is there anything in Paused?" without switching to find out. It is not
  rendered at all on House Sitting, which has stays rather than a client list.
- The view tabs keep the row, because they are the section's real navigation and
  hiding three destinations behind a button costs a tap on every switch.
- **Short labels on a phone**: "Customers" and "Sitting" against the full
  "Regular customers" and "House Sitting" from `sm`. They wrapped to two lines at
  390px and bought the row 16px. **The icons are gone below `sm`** — beside a
  text label an icon says nothing the word does not, and 22px of a ~103px cell
  was enough to truncate the selected tab to "Performan…".
- Result: **108px → 50px** on a phone, 104 → 46 on a tablet, no truncation at
  390/430/768.

**The five analytics blocks are separated by a tinted header, not a hairline.**
Top clients, Payment mix, Weekly workload, Service mix and Client map were
divided only by a `border-t`, with a 13px title set at the same weight as the row
labels beneath it — so the card read as one continuous slab and nothing said
where a block ended. They are **not** five cards: that is the first item on the
pre-ship gate, and five borders, five shadows and ten paddings would add roughly
140px of scroll to a page already 1566px on a phone. Instead `Section` wears the
same header strip the Finances Setup buckets use — tinted background, 15px
primary title — which is a boundary you cannot miss for 18px total across all
five.

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
  - No card lifts on hover; the shadow deepens instead, so the delete icon on a
    paused card never moves out from under the cursor.
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

### Finances Section

Every other section answers a question about the business. **Finances**
(`/finances`, its own nav item) asks the one the family actually asks at the end
of a month: did more come in than went out. It is a household view, not a tax
view — the year's deductible total lives in Reports and is not repeated here.

**It tracks recurring commitments, not spending.** This is the scope decision the
whole page hangs off, so it is written here first: a line belongs in Finances only
if it repeats whether anybody thinks about it or not — a paycheck, rent, payroll
tax, an insurance premium, a loan, a subscription, a standing transfer into
savings. Restaurants, an occasional trip, a one-off purchase are **not** typed
here and there is deliberately nowhere to put them. So the questions the page
exists to answer are: how much of the month is already promised before it starts,
and which commitment is worth killing. Anything that reframes it as a
list-every-transaction budget app is out of scope, and any layout that cannot
answer those two questions is the wrong layout however tidy it is.

Seven blocks, in this order:

| Block | Where the figures come from |
| --- | --- |
| Gross income | Typed lines (Ivan W2) + regular clients + house sitting |
| Tax withheld | Typed |
| Deductions | Typed — insurance, repayments, anything withheld that is not tax |
| Needs | Typed — rent, utilities, groceries as a standing figure |
| Subscriptions | Typed — the recurring services worth cancelling |
| Debt | Typed |
| Investments & savings | Typed |

**Subscriptions has its own block on purpose.** Filed under Needs they were
invisible: one $2,395 rent line drowns nine small ones, and "what am I paying for
every month that I no longer use" cannot be read off a total. Its own block means
its own total, its own share of income, and its own yearly run rate — and of
everything on this page, it is the one part a household can actually cut. Tax and
rent are not arguable; a pile of $15-a-month services is.

**Deductions here is not the business deduction.** It was, for a version: the
block read business spending and the mileage deduction off the books, which put a
*tax* total in the middle of a cash-flow page — the miles are not cash and could
never be subtracted, and the spending answers a Taxes question that Reports
already totals. It also left the money that genuinely comes out of a paycheck
before it lands — health insurance, a repayment, a garnishment — with nowhere to
be typed. So Deductions is the sixth typed bucket, with dated amounts and a
cadence like every other standing figure, and nothing about the business's
deduction appears on Finances at all. Business spending is not subtracted here
either, so a month with business purchases reads higher than the bank does; the
figure has one home, and it is Reports.

Two kinds of number meet on the page and they behave differently:

- **Standing figures** are typed once and carry forward. Each line owns a **dated
  schedule** (`finance_line_rates`), not a single amount: one row per change,
  `effective_from` inclusive. Amounts are always positive — direction is a
  property of the bucket, so a mistyped minus cannot turn rent into income.
  - **Each change records how often it arrives.** Almost nothing is genuinely
    paid monthly: a W2 lands every second week, insurance goes out quarterly.
    A rate therefore stores three things — `entered_amount` (what was typed),
    `cadence`, and `monthly_amount`, the monthly **average** derived from the
    pair. `Semi-monthly` exists separately from `Bi-weekly` for figures that
    really do arrive twice a month.
  - **A month is the payments that actually land in it, not an average.** This is
    the arithmetic the page lives or dies on. 26 fortnightly paydays do not
    divide by 12: anchored on 21 December 2025, 2026 pays twice in most months
    and **three times in March and August**. The first version spread 26/12
    evenly, so those two months read about $4,100 light and the other ten read a
    few hundred heavy, and nothing on the page said so. `occurrencesInMonth()`
    now generates the real dates from the line's anchor and `amountForMonth()`
    adds up what landed; the row says `3 payments · $4,159.62 every 2 weeks`, so
    a bigger August explains itself. Weekly does the same across 4- and 5-week
    months, a quarterly bill lands in the four months it is actually paid, and
    an annual one in the single month it leaves the account.
  - **A raise does not restart the cycle; a change of cadence does.** Payday is
    payday whatever the figure on it, so the anchor stays the line's first rate
    date and a later change only says what each payment is worth. Going monthly
    → fortnightly is a new schedule and re-anchors on the date it was given.
  - **The rhythm is inferred, so it is printed.** `scheduleSummary()` says when a
    line is paid — "Paid the 21st", "Paid every 2nd Thursday · next Sep 3",
    "Paid the 15th of Feb, May, Aug, Nov" — at the top of the line in Setup,
    where changes are typed. It has to be said out loud because the date on a
    line's earliest change does **two** jobs: it records when the amount changed,
    and it fixes which day of the cycle every payment lands on. Nothing said the
    second one, so entering a change dated *before* the first one silently
    re-timed the whole line — Rent moving off the 21st onto the 15th, or, on a
    fortnightly line, every payday in the year shifting by up to 13 days and the
    two months carrying a third paycheck moving with them.

    The arithmetic was never wrong about this: a line whose history starts in
    March really has been paid on the 15th since March, and the app is computing
    on better information than it had before. It was *silent*, which on this page
    is close enough to wrong — a year of months quietly restating themselves is
    exactly what "did the family come out ahead" cannot survive. Phase is only
    spelled out where a cadence can land on different days, so the fortnight
    names its next date and a monthly line just names its day.

    Still **not** done, and worth doing the day a quarterly bill or a backfill of
    2025 appears: giving the line an explicit anchor column, so the payday is
    edited directly rather than inferred from an amount's date. That is the
    structurally correct fix — two facts, two fields — and it is a migration plus
    a field in a panel that was just stripped down, for a failure the current
    data cannot reach (every line is anchored 25 Dec 2025 or Sept 2021, and there
    are no quarterly or annual lines).
  - **The mid-month blend is gone.** `amountForMonth()` used to walk the days and
    average a raise across the month, which is truthful about something that
    accrues daily and wrong about a paycheck — a paycheck is paid at the old
    figure or the new one, never at a weighted mean of the two. Each payment now
    takes the rate in force on the day it landed, and a month holding both says
    `2 payments · $4,038.46 then $4,159.62`.
  - **The run rate on a row is the rate annualised, never the month × 12.** In a
    three-paycheck August, month × 12 turned a $302.30 fortnightly tax into
    "$10,883 a year" against a real $7,859.80. `FinanceRow.yearAmount` carries
    `monthly_amount × 12` instead. `monthly_amount` survives for exactly this and
    for Setup's column, where it is tagged **`avg`** so it cannot be read as a
    claim about any single month.
  - The cadence is set from the **caption above the amount field** — the slot
    that used to read a dead "A MONTH". A setting most lines never touch costs
    no height that way, and tapping it shows the whole list with a tick rather
    than cycling. A new change inherits the cadence already in force on the line.
  - A non-monthly figure explains itself wherever it appears: the month row
    reads "$2,600.00 every 2 weeks" under the $5,633.33, the history row carries
    the typed figure under its date, and the entry row converts while you type.
- **A change already logged is edited in place.** Every row in a line's history
  is a button: tapping it turns that row into the same date + cadence + amount
  form, with Save, Cancel and Delete. Correcting one used to mean re-entering it
  on the same date and hoping you remembered the upsert rule, and a typo *in* a
  date could only be fixed by deleting the row — `updateFinanceRate` patches by
  id, so the date is editable like anything else, and moving a change onto a date
  that already has one is named rather than swallowed.
  - **Delete lives inside the edit state, not on the read row.** A trash icon on
    every history row was one mis-tap from losing a figure typed months ago, and
    it was the only thing those rows offered — so the row now offers editing and
    deleting is the deliberate second step.
  - The add-a-change form is hidden while a row is being edited. Two identical
    forms on one card, one adding and one correcting, is how a raise gets typed
    into the wrong one.
  - A single amount per line was the first design and it was wrong in the one way
    that matters: entering a raise rewrote every month back to the beginning,
    because the old figure had nowhere to live. Nothing about a past month moves
    now when a later change is entered.
  - **A change part-way through a month is blended across it by day.** $10,000
    going to $12,000 on 20 July pays 19 days at the old rate and 12 at the new
    one — $10,774.19 for a 31-day July — which is what lands in the account.
    Taking whichever rate was in force on the 1st would hide the raise for a
    month. `amountForMonth()` walks the days rather than doing interval
    arithmetic: 31 iterations, no boundary to get wrong.
  - **A line ends with a date, not a deletion and not a zero.** Every rate carries
    an optional `effective_to`, inclusive; null means it is still running. The
    months it did run still have to add up, so deleting the line is the one write
    on the Setup screen that asks for confirmation — it takes the whole history
    with it. The change-it-to-0 that used to be the only way to stop something is
    gone from the copy: it was right about the arithmetic and wrong about
    everything else, because the line then kept a $0.00 row in every month
    afterwards and "cancelled in September" was stored as the same thing as
    "still running, currently free". A line whose last rate has ended is dropped
    from the months after it (`manualRows`), reads `Ends Sep 20` in the month it
    stops in, and is worth 0 from the day after (`rateOn`). An end date on any
    rate but the last is a **gap**: the line pays nothing until the next dated
    change picks it up, which is what a subscription cancelled and re-taken looks
    like.
  - **Stopping is a one-tap control that shows you the date.** The line's footer
    in Setup carries `⊘` beside Delete: it opens the last change in the ordinary
    edit form with an end date pre-filled to today, so the date is a suggestion
    until it is saved rather than a silent write. Once ended the same control is
    `↺` — Resume, which clears the end date outright, there being nothing to
    choose about it. The end date is also an optional `Until` field on the
    add-a-change and add-a-line forms, absent until "Add an end date" is tapped:
    a permanent second date on every entry row would charge every raise for a
    setting most changes never use. On a desktop that fourth field wraps the
    explaining sentence onto its own line, because sharing the row left it 130px
    and five lines tall.
  - Before the first rate's date a line contributes nothing and reads
    "No amount set" — never a zero pretending to be a figure.
- **Linked figures** are read from the tables that already record them and are
  not editable here. Regular clients, house sitting, business spending and miles
  each have one home; a second, editable copy on this page would be a figure that
  silently goes stale.

Rules the arithmetic follows:

- **No business figure is on the page.** Neither the mileage deduction (never
  cash) nor business spending (Taxes' question, totalled on Reports) is read into
  the month, so nothing here can be a tax total pretending to be a bank balance.
- House sitting is spread over the nights it was slept in, not filed under its
  start date, so a stay from the 28th to the 3rd pays into both months. Cancelled
  stays earn nothing.
- Regular clients contribute one figure to every month, because a client record
  says what the arrangement is *now* and carries no history of months worked.
  Paused clients are excluded.
- Everything in `lib/finances.ts` is a pure function of rows somebody else
  loaded. The one thing this page must not get wrong is whether the family is up
  or down, and that is easiest to trust when no query can change the answer.

**Two columns where there is width, and nothing important behind a tap.** The
layout answers three questions in the order they get asked — what did the month
come to, what is it made of, how does it compare with the year:

- `MonthPicker` (the app's own, shared with Taxes) sits **at the top of the right
  column** — the header row already carries the title and Setup, so a picker on a
  row of its own left the whole top right of the page blank. The label opens a
  year-and-month grid. It takes a `variant`: `control` (the default, and what
  Taxes uses) stretches inside a row of controls; `panel` makes it a **card** —
  the same 20px radius, `shadow-card` and column width as the cards it stacks
  with — and keeps the arrows beside the label rather than at the box's edges.
  Four versions failed here and every failure is worth remembering: arrows at
  opposite edges of a full-width row; a month label that looked like a picker and
  did nothing when tapped; a capped picker filling its column, which put the
  arrows 500px apart again; and a 300px pill sitting above a 444px card, lining up
  with neither of its edges. A control that looks like a picker opens a picker, it
  keeps its parts within reach of each other, and it matches whatever it is
  stacked with.
- `MonthSummary` is three **peer figures at one size** — net, in, out. An earlier
  version set the net two steps larger, which made the reader ask why the type
  kept changing. Emphasis is colour, per financial convention: **green in
  surplus, red in deficit**, which is also the only cue the sign needs.
- **The month reads by section, in the order the buckets are declared.** Two
  cards — `Money in` and `Money out` — each split by `border-t` into its blocks:
  a header row carrying the bucket's name, its share of money in and its total,
  with that bucket's lines beneath it (biggest first inside the block). The
  order is fixed rather than sorted by size, so a block sits in the same place
  every month.
  - The version before this one dissolved the sections: it sorted the blocks by
    size in one card (`WhereItGoes`) and poured **every line in the month** into
    another, biggest first, with its block written under it in 10px grey
    (`Commitments`). That answered "which single commitment is largest" and lost
    the question the page is opened with — what does each part of the month
    cost — because a line could not be found where it lives, and tax withheld
    sat three rows away from tax withheld. Neither card is coming back.
  - **The meter stays**, at the top of `Money out`: how much of what came in is
    spoken for is one ratio against a limit, both ends directly labelled
    ("37% committed · $4,328.16" / "63% left · $7,485.08").
  - **One scale across the whole card, not one per block.** Every bar in
    `Money out` is measured against the largest line in the month, so a $15
    subscription draws a $15 bar next to rent and the cross-block comparison the
    flat list existed for survives the grouping. Per-block scaling is the
    already-rejected trap that gave a $2.10 line a full-width bar.
  - **A line on the month is its name, its bar and its figure — the rest is
    behind its chevron.** Every row used to print three more facts: "2 payments ·
    $316.84 every 2 weeks" under the name, "$8,238 a year" beside the amount, and
    on `Money in` a share as well. Down a dozen rows that is two lines of grey
    between every figure, competing with the one thing the card exists to show —
    what this costs *this month*. That took the phone view from **1249px to
    1098px** and a detailed row from 66px to 51.

    **It opens over the list, not inside it — a `ⓘ`, not a disclosure.** Two
    attempts got here. Joining the facts into one grey sentence (`2 payments ·
    $316.84 every 2 weeks · $8,238 a year`) read as an annotation *on* the row
    rather than an answer to it. Expanding the row in place answered properly and
    **moved the page**: this is a list read by scanning down a column of figures,
    and pushing everything below the row down by four lines costs the reader
    their place — for a glance that is over in a second. Reflow is the wrong
    price for a peek.

    So the row carries a small `ⓘ` and the detail opens in an `AnchoredPanel`,
    the same primitive the pickers use: portalled clear of the card's
    `overflow-hidden`, pinned under the icon, flipping above it near the bottom
    of the screen. Measured at 390: page height is **identical open and closed**,
    nothing scrolls, and dismissing puts the reader back exactly where they were.

    ```text
    Federal Income Tax (Ivan)     $950.52  ⓘ
                        ┌────────────────────────────┐
                        │ FEDERAL INCOME TAX (IVAN)  │
                        │ Every 2 weeks      $316.84 │
                        │ Payments     3 · usually 2 │
                        │ Since Aug 6, 2026  was $302.30 │
                        │ ────────────────────────── │
                        │ $8,238 a year              │
                        └────────────────────────────┘
    ```

    The panel names its row, because it floats away from it.

    **Every row in it has to say something the month row cannot**, and the first
    version failed that test badly enough to be worth recording: it listed every
    payment by date. On a line whose payments are all worth the same — which is
    almost every line, almost every month — "Sep 3 $302.30 / Sep 17 $302.30" is
    one figure printed twice, and two lines of it made the panel look like it was
    answering while it was padding. `lineDetail()` in `lib/finances.ts` decides
    the contents now, and four things pass:

    - **What one payment is worth**, when the month's figure is not simply it. A
      monthly line's payment *is* the row, so it is left out; a fortnightly one's
      is the actual paycheck, which is the figure a person recognises.
    - **How many landed, against how many usually do.** This was missing, and it
      is the answer to the only question a month total really raises — why is
      this bigger than last month. `3 · usually 2` says it outright, and it is
      stated even when the dates are listed above it, since the comparison is the
      point and cannot be counted off them. Only Weekly and Bi-weekly have a
      "usually" at all; every other cadence lands the same number of times in
      every month it is due.
    - **When the amount last moved, and what it was.** Nowhere else on the month
      is a line's history visible, and "Since May 1, 2026 · was $10.99" is what
      turns a subscription figure into a subscription that crept. Only across a
      change of amount at the same cadence — monthly → fortnightly moves the unit
      as well, so "was $2,600" would compare two different things — and never in
      the month the change lands in, where the dated list already showed it
      happening.
    - **The dates**, only in that month, where the payments are worth different
      amounts and nothing but the list says which is which.

    Deliberately **not** in it: the date a line's first rate carries. For most
    lines that is when the figure was typed into the app, not when the commitment
    started, so "Since Dec 25, 2025" on a rent line running since 2021 would be a
    claim the data cannot support.

    A linked figure has no schedule to describe — it is an estimate off another
    table — so there the hint that used to sit on the row is the whole detail.
    **When the note is the only thing in the panel it is set as content**, not as
    the 11.5px grey footnote it is under a list of rows: a single grey line under
    a heading reads as a panel that failed to load. And a line that has ended is
    worth 0 a year from the day after, so the run rate is dropped rather than
    printed as `$0 a year` — the zero-pretending-to-be-a-figure this page keeps
    catching itself doing.

    **The row stays a reading; only the icon is a control.** Its target is 42×42,
    bought with padding pulled back by an equal negative margin so the row keeps
    the 51px it had — and **only the 26px circle inside that target is painted**.
    Hover, press and focus all landed on the 42px box first time out, which lit a
    square three times the icon's size; `.focus-ring-child` and a `group-hover`
    on the child are what keep the treatment the size of the thing being touched.

    Nothing is deleted, and the **yearly run rate is still the reason the detail
    exists** — $15 a month is a shrug and $180 a year is a decision. It is still
    rounded (`formatCurrencyRounded`), because a run rate is an extrapolation
    rather than an amount anybody was charged, and still taken from the line's
    own rate rather than this month × 12, which would annualise a three-paycheck
    August at 1.5×. It is simply not mandatory on every row.

    The icon is deliberate rather than a secretly-tappable row: a row nobody can
    see is interactive is a row nobody taps.
  - **Headings say what they hold**: `Money in`, `Money out`, and the bucket's
    own name. Nothing is titled with a phrase that has to be interpreted.
  - An empty block is its header row and nothing else.
- **Magnitude is length from a shared baseline, never colour.** The block palette
  (sand, stone, gold, slate, terracotta, sage) was run through the colour-vision
  checks and **fails as a categorical encoding**: worst adjacent pair ΔE 5.9 under
  deuteranopia, and 9.3 under *normal* vision against a floor of 15. Those hues
  keep their identity job — a dot beside a name, a strip in Setup — and are never
  asked to carry a quantity again; that also rules out a ring of seven slices. So
  each chart is one series in one hue (`OUT_INK`, `IN_INK` in
  `components/finances/chart.tsx`, both ≥ 3:1 against the surface), which needs no
  legend because the card's title names it.
- Mark spec, from the house data-viz rules: 10px bars, a 4px rounded data-end with
  a square baseline, a hairline track one step off the surface, **no gridlines**
  (every value is labelled), no dashes, no borders drawn around marks, and **no
  mark at all for a zero** — an empty track is a bar drawn for a quantity that does
  not exist. Figures live in a fixed right-hand column rather than at each bar's
  tip: tip labels put every number at a different horizontal position, which is
  fine for one bar and useless for reading down thirty. `tabular-nums` in those
  columns, and **not** on the stat tiles, where equal-width digits only make a
  standalone figure look loose.
- Rejected, with reasons, so none of them come back: **per-row bars scaled inside
  their own block** (a $2.10 line got a full-width bar in an otherwise empty
  block, and no two blocks were comparable — nobody could say what a length
  meant); **a bar column of its own** (58px taken off the label, turning "OR
  Statewide Transit Tax (Ivan)" into "OR Statewide Transit Tax (I…" at 390px);
  **filling the row background** (a 16% tint of olive on off-white is not a length
  anyone can measure); and a **donut with a legend**, which is the weakest possible
  encoding for seven similar shares and needs a palette that fails the checks.
- **`minmax(0, …)` on the phone's single grid column, not just the desktop
  pair.** An `auto` grid track sizes to its widest item's min-content, and
  min-width:0 inside a flex row does not cap that contribution — so one long line
  name in the breakdown pushed the whole page 81px wider than the screen and
  every card, the summary included, scrolled sideways.
- **The grid is two real rows, so cards that sit side by side end level.** Row one
  is the month picker and the month's total; row two is the breakdown and the
  year. The picker was floating above a column that spanned both rows, which left
  it 14px shorter than the summary beside it — close enough to look like a
  mistake rather than a choice. In a shared row it stretches to match, and the
  `panel` variant fills the height it is given. `YearList` keeps `self-start` so
  it ends where its content ends instead of stretching to the breakdown.
- **The columns are sized to their content, not split down the middle.** The
  breakdown is capped at 460px, which is what its rows need — label left, amount
  right, and past that the middle is only gap — so `YearList` gets the remaining
  ~440px, where the extra width buys a bar you can actually read across. Widths
  went the wrong way round first: the breakdown had ~700px of mostly gap and the
  year was squeezed into a 240px rail.
- `YearList` keeps **a figure against every month** — a wide rail of twelve on a
  desktop (month, bar, figure in three columns), two columns of six on a phone,
  where a middle bar column would leave the bar about 40px wide. Those two
  columns are **column-major**: a CSS grid fills row by row by default, which put
  Jan beside Feb and ran the year left-right, left-right down the card, so
  reading it in order meant zig-zagging and neither column was a sequence on its
  own. `grid-flow-col` over six fixed rows fills downwards instead — Jan–Jun in
  the left column, Jul–Dec in the right, each a half-year read straight down —
  and both are reset at `lg`, where the rail is one column and the question never
  arises. It was briefly twelve bare columns, and
  that is the mistake to not repeat: a column chart with no numbers cannot answer
  "how much", so comparing two months meant tapping one, reading the headline,
  tapping the other and holding the first in your head. Month-over-month
  comparison is the whole job of the block. The only thing ever wrong with the
  list was its width, and width is fixed by a column, not by deleting the figures.
- **The header pair is a fixed 60px each, always.** `MonthSummary` and the picker
  share grid row one, so anything that changes one's height moves the other. A
  composition bar used to sit under the figures and render only once something
  had been allocated, which made the picker beside it jump by 50px between
  months; it is gone, and the share each block takes is on that block's row in the
  breakdown, where you are already looking when you want it. Both cards are pinned
  to `h-[60px]` rather than left to their content.
- **The picker's arrows never move.** Its label sits in a fixed 196px box, so
  "May 2026", "September 2026" and the `Now` chip all re-centre inside it while
  the controls either side stay put. Centring a variable-width group was the
  version that crept.
- Empty blocks are a header row and nothing else.

The month costs about 160px of scroll on a 390x844 phone with every line and every
month on screen, against roughly 1600px when each block was its own card. Zero
scroll is not the target — it was briefly reached by hiding the data, which is
worse than scrolling for it.

Setup is a **panel — not a tab, and not a route** (`SetupSheet`). A full-width
segmented row for two tabs charges 48px to every visit for a screen opened a few
times a year; but the route that replaced it was worse and more irritating, since
it meant a page load and a fresh set of queries to show figures the month behind
it had already loaded, then another load coming back. As a panel it opens
instantly on data already in memory, and a saved change lands on the month
underneath while the panel is still open — which is the whole reason you opened
it.

**It is a centred dialog on a desktop, 880px wide, and the whole screen on a
phone.** It was a 520px slide-over, which sizes itself from the edge of the
screen rather than from what is inside it: a date, a cadence and an amount were
fighting over 470px while 900px of page sat dimmed behind them. Nothing in here
wants to be read beside the month — the month is not readable while this is open
— so it takes the middle of the screen and lays the fields out across it. The
header stays put and the figures scroll under it.

Inside, the six buckets are strips in one card, each with its total and a `+`.

- **A heading outranks its lines**, which is the whole job of a heading. The
  bucket name was 10.5px uppercase tertiary above 14px near-black rows — a label
  whispering above the things it governed, so the eye read the lines first and
  had to hunt upward to find out which bucket it was in. It is 16–17px primary
  now, and the line rows sit a step below it.
- **No blurb under the name** — "Before anything is taken out" under Gross income
  tells whoever typed those figures nothing they did not know, and six of them
  cost about 96px on a phone for nothing.
- **A line in the list is its name and its figure. Nothing else.** It carried a
  third column too — "Since Aug 20 · 2 changes", "Ends Sep 30" — and that is the
  history restated above itself, on every row of a list that is read to find a
  name. Everything it said is in the expansion already: `scheduleSummary()` names
  the rhythm and the dated rows name every change, in full, with the amounts.
  Dropping it took the mobile row from **57px to 38px** — about 190px off a
  ten-line list — and handed its 220px column to the label, which had been
  truncating "OR Statewide Transit Tax (Ivan)" and now runs to 631px on a
  desktop without cutting anything.

  Two things it said that the dated rows do not, so both moved rather than
  vanished: a change dated in the future is tagged **`Upcoming`** on its history
  row, and a line with no rate yet reads **`—`** rather than `$0.00`, which is
  the zero-pretending-to-be-a-figure the old "No amount set" was guarding
  against.

  The history rows still read in three columns — date, the typed figure with its
  cadence, the monthly figure — so each runs down a straight edge.
- **A field never shares a line it cannot fit on.** The date trigger needs about
  150px for "September 20, 2026"; sharing a 308px phone row with the amount and
  Save left it 93px and it wrapped to two lines. So on a phone the date takes its
  own line and the amount stretches to the end of the next one; on a desktop the
  whole row — date, cadence, amount, Save, and the sentence explaining the
  conversion — fits across in one.
- **A field shares its row with another field, never with a button.** The
  amount once measured **140px** of a 308px phone row (the Save square and "Add
  an end date" had the rest) and the end date **260** (a ✕ beside it) — the part
  that is read and typed into was always what got shortened. The fix for that is
  not full width for everything: a date and an amount both fit a phone row, and
  giving each its own line wasted half a row twice over. So the entry forms are a
  **two-column grid on a phone** (`grid-cols-[1.3fr_1fr]`, ~171px and ~131px) and
  a single flex row on a desktop: `From | Amount`, then `Until | —`. Only a name,
  which can be long, spans both columns.
- **Every committing action is a named button, and destructive is red at rest.**
  Save, Cancel and Delete were three identical 44px grey squares told apart by an
  icon and, for Delete, a red **hover** colour — and a phone has no hover, so on
  the screen this panel is actually used on, the button that destroys a figure
  typed months ago looked exactly like the one that closes the form.
  `ActionButton` carries the tone at rest (accent / bordered / red) and
  `FormActions` puts the three on **one row at every width** — about 220px of a
  308px phone row — with the destructive one at the far left, where it is not on
  the way to Save. Named does not mean full width: stacking them cost two lines
  of height to say the same thing. The line's own Stop and Delete stay 44px icon
  squares on the name's row, since what was wrong with them was never their width
  but that they looked identical; delete is red at rest now.

  **Folding the actions into the field row is a tried and failed idea.** On a
  desktop the edit row is From 260 + amount 150 + until 230, and the three
  buttons are another 329 — 969 against 818 available, so the dates shrank to
  141px and wrapped to two lines. The empty right side of that row when `Until`
  is open is the lesser cost.
- **44px is the floor for anything tappable**, including the bucket `+` (was 36)
  and the two controls that live on a label line — the cadence caption and
  `Remove`. Those two grow their hit area with padding and pull it back with an
  equal negative margin, so the target is ~40px and the row keeps the height it
  had. A control that looks like a label still has to be one to hit.

  **A big target is not a big control.** Both paint only the words inside them —
  measured, the cadence caption is a 94×47 target painting 78×23, and `Remove` a
  70×47 target painting 54×23. Left on the button, the hover filled the whole
  inflated box and a 12px caption lit up a 47px block. Same rule, same helper
  (`.focus-ring-child`), as the month's `ⓘ`.
- **The amount field says it is the amount.** Its caption was the cadence alone,
  so between `FROM` and `UNTIL` sat a field labelled `2 WEEKS` — which says when,
  and never says what the number is. It reads `AMOUNT · 2 WEEKS ⌄` now; the word
  is plain text and only the cadence beside it opens anything.
- `FieldShell` takes an **`action`** slot on the label line, right-aligned, for
  whatever acts on the field as a whole — clearing an optional one, mostly. Put
  beside the input instead, it eats the input's width, which is how the end date
  came to be 260px of a 308px row.
- **No prose in this panel.** The dialog had a subtitle saying money comes in and
  goes out; every entry row carried a sentence saying what the figure came to a
  month on average and that each month counts the payments that land in it; the
  edit row repeated it. None of it told whoever typed those figures anything they
  did not know, and all of it is gone. **One sentence survives**, on the one line
  with a fixed payday: "Saved as that week's Thursday." That is not description,
  it is notice that the date being typed is about to be moved — which is the test
  for whether a sentence stays: does it say something the numbers cannot.

The month is read-only throughout; every typed figure is written in Setup, where a
line opens to its whole history and takes a change as a date plus an amount. It
was one screen at first, with a pencil on each block — that stopped working the
moment a figure became a schedule, because a pencil there has to answer "change it
from when?", which the month you are looking at cannot answer. Linked rows carry a
source badge and appear only on the month.

Below the blocks, **Left over by month** puts all twelve months on one centre
line, surplus right in green and deficit left in red, and tapping a month selects
it. One month cannot tell you whether a deficit is the shape of the household or
the shape of one bad August. Rows rather than columns, like the Reports
breakdown — twelve labelled columns on a phone are unreadable.

**No prose verdicts**, same as Mileage. The headline says "Left over" or "Short",
and nothing on the page tells the reader what to conclude about it.

An unrun migration is a notice, not a broken page: `finance_lines` failing to
load reports itself and the linked half still renders. PostgREST answers a table
it has never seen with `PGRST205`, before Postgres gets to say `42P01`, so
`isMissingTable()` checks both.

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

- `app/finances/page.tsx`: Finances — the household month, in and out.
- `lib/finances.ts`: The month's arithmetic. Pure; no queries.
- `lib/financeClient.ts`: Reads and writes for the standing figures.
- `components/finances/MonthSummary.tsx`: Net, in, out, and where the income went.
- `components/finances/MonthBreakdown.tsx`: Money in and money out, by section.
- `components/finances/chart.tsx`: Bars, meter, chart ink and the mark spec.
- `components/finances/YearList.tsx`: Twelve months, twelve figures.
- `components/finances/SetupSheet.tsx`: The standing figures, over the month.
- `components/finances/SetupGroups.tsx`: Every standing figure and its dated history.
- `components/finances/CadencePicker.tsx`: How often a figure arrives, as the amount's caption.
- `components/ui/AnchoredPanel.tsx`: A panel pinned to a control, portalled clear of anything that clips.
- `supabase/finances-schema.sql`: `finance_lines`.
- `supabase/finance-rates-schema.sql`: `finance_line_rates` — the dated amounts.
- `supabase/finance-cadence-schema.sql`: `entered_amount` and `cadence` on a rate.
- `supabase/finance-rate-end-schema.sql`: `effective_to` — the day a rate stops.
- `supabase/finance-deductions-bucket-schema.sql`: `Deductions` as a typed bucket.
- `supabase/finance-subscriptions-bucket-schema.sql`: `Subscriptions` as a bucket.
- `types/finance.ts`: Buckets, lines, and the shape of an assembled month.
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
- `app/health/page.tsx`: Health — person tabs, Body/Weight/Fatloss.
- `lib/health.ts`: Health queries, and the trend/BMI/goal maths.
- `components/health/TodayCard.tsx`: The weigh-in, the trend row, the person avatar.
- `components/health/PersonMenu.tsx`: Whose readings — avatar, dropdown, tick.
- `components/health/LogSheet.tsx`: The full reading — tape, body fat, an older date.
- `components/health/primitives.tsx`: Tiles, sheet, stats, sparkline, ring, chart.
- `components/health/WeightDetail.tsx`: The history and the fitted line.
- `components/health/BodyDetail.tsx`: BMI, the tape, height and birth date.
- `components/health/GoalDetail.tsx`: The goal, the pace, and composition.
- `supabase/health-schema.sql`: `health_profiles` and `health_entries`.
- `app/clients/page.tsx`: Clients section.
- `app/api/users/route.ts`: Everyone signed in, by display name.
- `lib/userLabels.ts`: The client side of that route.
- `supabase/shared-access-schema.sql`: Shared-access RLS for every table.
- `app/onboarding/page.tsx`: Post-signup nickname onboarding screen.
- `app/login/page.tsx`: Sign-in/sign-up entry point.
- `app/profile/page.tsx`: Profile section.
- `components/AppShell.tsx`: Desktop sidebar and mobile bottom nav.
- `components/PageHeader.tsx`: The section title every page shares.
- `scripts/verify-ui.mjs`: Renders pages in Chromium and measures them.
- `components/ClientForm.tsx`: Add/edit client form.
- `components/AddressAutocomplete.tsx`: Google Places address autocomplete.
- `components/ClientCard.tsx`: Client card UI.
- `components/clients/ClientFilterMenu.tsx`: Active/Paused/All as a header chip.
- `lib/useAuthUser.ts`: Auth user and profile role loading.
- `lib/clients.ts`: Client constants and earnings calculations.
- `types/client.ts`: Client and pet TypeScript types.
- `supabase/clients-schema.sql`: SQL for client/pet tables.
- `supabase/schema.sql`: Expenses schema plus profiles table, helper functions, and triggers.

## Verifying UI Changes

**Never hand a UI change back unverified, and never ask Ivan to check whether it
looks right.** He has said this outright, and every instance has been a real
failure: the press-scale that flashed white gutters, the title sitting 7px lower
on Clients, the header gap that differed per section. None of them appeared in a
diff, a typecheck, a lint or a build — all of them were obvious the moment a
browser rendered the page. `npm run typecheck && npm run lint && npm run build`
is the floor, not the check. A phrase like "worth a look on the preview" in a
reply means the work is not finished.

Chromium is always available at `/opt/pw-browsers` and `scripts/verify-ui.mjs`
drives it, so there is no environment in which the check cannot be done:

```bash
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright --prefix /tmp/pw
npm run dev &
NODE_PATH=/tmp/pw/node_modules node scripts/verify-ui.mjs \
  "http://localhost:3000/" "http://localhost:3000/health" \
  --selectors "h1,#first" --widths 390,1280
```

It prints the bounding box of each selector at each viewport and writes
screenshots — so "the titles line up" is a measurement (`top 31 left 16` on every
section) rather than an opinion, and the screenshots get read back, not just
saved. Measure at **390px first**: this app is used on a phone.

**A resting screenshot is not the check for anything interactive.** Add
`--states` and the script walks each selector through rest, hover, press and
focus, printing the **hit area** against the box that is actually **painted**
inside it:

```bash
node scripts/verify-ui.mjs "http://localhost:3000/x" \
  --selectors 'button[aria-label^="What"]' --widths 390 --states
```

```text
rest   hit 42x42  painted none    ring not on hit area
hover  hit 42x42  painted 26x26   ring not on hit area
press  hit 42x42  painted 26x26   ring not on hit area
focus  hit 42x42  painted 26x26   ring not on hit area
```

This exists because of a real miss. A small control — a 14px `ⓘ`, a 12px caption
— needs a 40px+ target, bought with padding and pulled back with an equal
negative margin. That is right about the thumb and says nothing about the paint:
a `hover:bg-subtle` on the button then fills the **whole** 42px box, so the icon
lit up a square three times its size on every press. The resting screenshot was
read and looked fine; the pressed state was never rendered. So: the button is a
transparent target, its one child is the thing that is seen, and
`.focus-ring-child` puts the focus ring on the child rather than the target.
Anything with a hover, press or focus treatment goes through `--states` before it
is handed over.

When the change is behind auth and no session is available — the remote
container has no `.env.local`, since it is gitignored and lives on Ivan's
machine — do not stop there. Render the same components through a temporary
route under `app/` that supplies a fake `user` and mock props, measure that, and
**delete the route before committing**. A harness that reproduces the real JSX
proves geometry exactly; it just cannot prove data.

Signed in, against real data, is still the better check, and is what the flow
below is for. Anything that renders must eventually be seen that way — twice,
"compiles and serves clean" has hidden a bug that was obvious on screen.

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

**Never create a branch.** `staging` is not the default working branch, it is the
only one: all normal commits go to `staging`, which deploys automatically to the
Vercel preview environment. A remote session that assigns a `claude/...` branch
is not an exception — push the work to `staging` regardless, because a side
branch does not deploy and Ivan reviews on the preview. See the branch rule at
the top of this file. The repository-local Git default branch and default push ref are both `staging`, and `origin/HEAD` should point to `origin/staging`.

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

Run `supabase/health-schema.sql` in Supabase. It is re-runnable and creates
`health_profiles` and `health_entries`. Until it runs, `/health` loads but shows
a setup notice instead of the tabs.

Then run `supabase/finance-rates-schema.sql` in Supabase. It is re-runnable. It
creates `finance_line_rates` and carries each existing line's single amount over
as its opening rate, dated 1 January of the year the line was created. Until it
runs, `/finances` still reads every linked figure and the Setup tab still opens,
but no typed figure loads and saving one reports the table missing.

`supabase/finances-schema.sql` was applied on 19 August 2026. It creates
`finance_lines` and seeds a single `Ivan W2` line so the first visit is not an
empty page. It is re-runnable, and re-running never resurrects a line somebody
deleted. Before it ran, `/finances` loaded and every linked figure read
correctly, but the typed blocks showed a notice and saving a line reported the
table missing.

Then run `supabase/finance-deductions-bucket-schema.sql` in Supabase. It is
re-runnable and one statement: it widens the `finance_lines` bucket check
constraint to allow `Deductions`. Until it runs, the Deductions block and its
Setup strip are both there, and adding a line to it reports the missing migration
rather than failing silently.

Then run `supabase/finance-subscriptions-bucket-schema.sql` in Supabase. It is
re-runnable and one statement: it widens the `finance_lines` bucket check
constraint to allow `Subscriptions`. Until it runs, the Subscriptions block and
its Setup strip are both there, and adding a line to it reports the missing
migration by name rather than failing silently.

`supabase/finance-cadence-schema.sql` was applied on 19 August 2026. It adds
`cadence` and `entered_amount` to `finance_line_rates` and backfilled every
existing row as Monthly, which is what the single column meant. It is
re-runnable. Before it ran, Finances read and saved monthly figures exactly as
before, and choosing any other cadence reported the missing migration rather
than silently dropping it.

Then run `supabase/finance-rate-end-schema.sql` in Supabase. It is re-runnable
and two statements: it adds the nullable `effective_to` column to
`finance_line_rates` and the check that keeps an end date on or after the date it
starts. Nothing needs backfilling — every existing rate is open-ended, which is
what null means. Until it runs, Finances reads and saves exactly as before and
only an end date reports the missing migration by name, rather than being
silently dropped.

**`Ivan W2` is paid on Thursdays, and the app enforces it.** `PAYDAY_WEEKDAY` in
`lib/finances.ts` maps that one label to Thursday; `snapToPayday()` moves any
date to the Thursday of the week it falls in (weeks run Sunday to Saturday, which
is what makes Sunday 21 December mean the Thursday *after* it), and a date
already on a Thursday is left exactly as it is. Setup snaps on save, so the date
stored, the date shown in the history and the date the month counts are the same
one, and the entry form says so under the field. `manualRows` snaps again on read
as a backstop, so a row written any other way still cannot put the paycheck on a
Sunday. The rule is keyed by label and deliberately applies to **nothing else** —
not Rent, not the withholding lines. Renaming the line turns it off, which is the
right failure: the app would then have no reason to believe anything about when
it is paid.

**The date on a line's first change is now its payday, so it has to be right.**
It was only a "from when" while months were averaged; it is the anchor of the
whole cycle now, and a wrong weekday is a wrong answer rather than a rounding
error. Ivan W2 and the seven withholding lines were anchored 21 December 2025,
**a Sunday** — the paycheck actually lands on Thursdays, so the app generated
Sunday paydays and put the year's two extra paychecks in March and August. All
eight were moved to **Thursday 25 December 2025** on 21 August 2026; 2026 now
pays them 26 times with the third paycheck in **April and October**. The W2's
raise is still dated 2 August 2026, which is not itself a payday: it applies from
the Thursday 6 August paycheck, the same one it applied to before.

`Rent` is anchored 21 September 2021, so it counts as paid on the 21st of each
month; that does not change any total (a monthly line pays once a month whatever
the day), it only decides which side of a mid-month change a payment falls on. If
the real rent day is the 1st, fix it by editing the first change's date in Setup.

Then run `supabase/shared-access-schema.sql` in Supabase. It is re-runnable. It
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
