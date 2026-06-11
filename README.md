# Sviy Hub

Sviy Hub is a private business expense tracker for one small-business owner. It uses Next.js, Supabase Auth, Supabase Postgres, and Supabase Storage.

The `main` branch contains the deploy-ready version of the app.

## 1. Install dependencies

```bash
npm install
```

## 2. Create Supabase project

In Supabase:

1. Create a new project.
2. Open SQL Editor.
3. Run the SQL in `supabase/schema.sql`.
4. Open Storage.
5. Create a private bucket named `receipts`.
6. Open Authentication, then manually create the one user who will log in.

## 3. Add environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

The app only uses the public URL and anon key in browser code. Keep the service role key private and never expose it in client-side code.

## 4. Run locally

```bash
npm run dev
```

Then open `http://localhost:3000`.

## 5. Deploy to Vercel

1. Push the project to GitHub.
2. Import it in Vercel.
3. Add the same environment variables in Vercel Project Settings.
4. Set the Vercel project name/subdomain to `sviy-hub`.
5. Deploy.

## What is already built

- Private email/password login.
- Expense dashboard with summary cards.
- Fast add-expense form with receipt preview and Supabase Storage upload.
- Current-month expense list with month/category/payment/search filters.
- Edit and delete expense actions.
- Signed receipt opening for private files.
- Reports page with Schedule C category totals.
- Monthly CSS bar chart.
- CSV export for the selected tax year.
