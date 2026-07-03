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
- Added reports page with Schedule C table, monthly breakdown, and CSV export.
- Moved Reports into the Expenses section as an Expenses/Reports segmented sub-tab.

### Navigation Redesign

- Removed the old top navigation header.
- Added `AppShell` with:
  - Desktop left sidebar.
  - Mobile fixed bottom tab bar.
  - Tabs for Expenses, Clients, and Profile.
- Added safe mobile bottom padding so content does not sit under the tab bar.
- Strengthened the visual system with warmer backgrounds, larger form controls, softer shadows, and more rounded cards.

### Clients Section

- Added `/clients`.
- Added client list with Active / Paused / All filters and counts.
- Added client cards showing:
  - Client name.
  - Pet names.
  - Pet type icons.
  - Payment method badge.
  - Estimated monthly earnings with a compact `/mo` period label.
  - Admin-only owner label showing the client's owner nickname.
- Client card behavior:
  - Paused clients render with a muted/greyed-out style so they are obvious in the All view.
  - In the All filter, Active clients sort first and Paused clients sort at the bottom.
  - Active and Paused tabs keep their existing name-based ordering.
  - Admin-only delete icon appears only for Paused clients.
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
  - Admin edits preserve the original client owner instead of reassigning the client to the admin.

### Client Database

- Added `supabase/clients-schema.sql`.
- Schema includes:
  - `clients` table.
  - `pets` table.
  - Admin-aware RLS policies.
  - Indexes for client status/name and pet ownership.
- Supabase Storage bucket still needs to exist manually:
  - `pet-photos`

### Admin/User Permissions

- Added backend-only admin/user permission system.
- No UI changes were made for roles.
- Created `profiles` table in Supabase:
  - `id uuid primary key references auth.users(id) on delete cascade`
  - `role text not null default 'user'`
  - `nickname text`
  - Role values are constrained to `admin` or `user`.
  - `created_at` and `updated_at` timestamps are included in SQL docs.
- Added `is_admin()` SQL helper function.
- Added `handle_new_user_profile()` trigger function.
- Added `on_auth_user_created` trigger on `auth.users` so new auth users get a default `profiles` row.
- Updated RLS policies for:
  - `expenses`
  - `clients`
  - `pets`
  - `profiles`
- Permission behavior:
  - Regular users can see/manage only rows where `auth.uid() = user_id`.
  - Admin users can see/manage all rows in current app tables.
  - Admins can manage profile rows.
  - Users can view their own profile.
- Frontend role behavior:
  - `useAuthUser()` now loads `profiles.role` and exposes `isAdmin`.
  - Clients, expenses dashboard, and reports only apply `.eq("user_id", user.id)` filters for non-admin users.
  - Admin users rely on RLS to see all rows.
  - This fixed the bug where admin RLS allowed all rows but the frontend still filtered to the admin's own `user_id`.
- Added protected admin-only API route `app/api/admin/user-labels/route.ts`.
  - Uses the user's bearer token to confirm the caller is authenticated.
  - Checks `profiles.role = 'admin'`.
  - Uses `SUPABASE_SERVICE_ROLE_KEY` server-side to resolve auth user IDs to profile nicknames.
  - Falls back to auth email/name only if a nickname is missing.
  - Regular users do not call this route and do not see owner labels.
- Added user nicknames:
  - Existing owner/admin nickname should be `Ivan K. (Admin)`.
  - Existing Yana nickname should be `Yani`.
  - Owner labels on admin client cards now use nicknames instead of email when available.
- Added signup/onboarding flow:
  - Login remains a normal sign-in flow and does not force onboarding.
  - Login page now has a sign-up mode.
  - Successful sign-up redirects to `/onboarding`.
  - `/onboarding` asks for a nickname and saves it to `profiles.nickname`.
  - The onboarding page is intentionally separate so it can be extended later with more profile fields.
- The admin SQL has already been run successfully in Supabase.
- The current owner account has already been set to `admin`.
- Yana remains a regular `user` by default unless manually promoted.
- Future app tables should include a `user_id uuid references auth.users(id) on delete cascade` column and reuse this policy shape:

```sql
using (auth.uid() = user_id or is_admin())
with check (auth.uid() = user_id or is_admin())
```

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
- `app/reports/page.tsx`: Reports sub-section.
- `app/clients/page.tsx`: Clients section.
- `app/api/admin/user-labels/route.ts`: Admin-only API route for resolving owner labels.
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
- `supabase/clients-schema.sql`: SQL for client/pet tables and admin-aware RLS.
- `supabase/schema.sql`: Expenses schema plus profiles table, admin helper functions, triggers, and admin-aware RLS.

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

Only deploy production when explicitly told `push live`. To do that, fast-forward `main` from the tested `staging` branch, push `main` to `origin`, and then return the local workspace to `staging`:

```bash
git checkout main
git merge --ff-only staging
git push origin main
git checkout staging
```

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

- Change the first number for structural product changes, such as a new major app area, navigation-level feature, or database-backed workflow.
- Change the second number for major feature additions inside the current structure, such as a new analytics section or complex reporting block.
- Change the last number for fixes, UI polish, copy updates, and other minor changes.

The repo pre-commit hook always increments the last number in `version.json` and stages it automatically. When setting a structural or major-feature version before commit, account for that hook so the committed version still follows the intended version family.

## Next Step

Create the private Supabase Storage bucket if it does not exist yet:

```text
pet-photos
```

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

1. Log in as admin and confirm all users' clients/pets/expenses are visible.
2. Confirm admin client cards show nickname owner labels.
3. Log in as Yana and confirm only Yana-owned rows are visible.
4. Confirm Yana does not see owner labels.
5. Confirm admin test data is not visible to Yana.

Also test client-card/edit behavior:

1. Confirm Active clients do not show a delete icon.
2. Confirm Paused clients show a delete icon for admin only.
3. Confirm hovering Paused cards does not move the delete icon.
4. Edit an existing client and confirm `Update client` opens the change summary modal.
5. Confirm `Cancel` returns to editing and `Confirm changes` saves.

If autocomplete does not work on `localhost`, update the Google Cloud key referrers to include `http://localhost:3000/*`.
