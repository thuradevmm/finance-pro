# FinancePro

A modern personal finance management MVP built with Next.js, TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and Row Level Security.

FinancePro helps a single owner manage personal financial records across accounts, categories, transactions, budgets, savings goals, debts, subscriptions, and assets. The app is designed as a clean browser-based replacement for spreadsheet-based tracking, with Myanmar Kyat as the main working currency.

> MVP status: core financial CRUD flows are connected to Supabase. Some future pages such as dashboard reports, documents, future planning, people payments, profile, and settings are still placeholder-level.

## Tech Stack

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase PostgreSQL
- Supabase Row Level Security
- Supabase CLI migrations
- ESLint

Prisma is not used.

## Current MVP Features

### Authentication

- Login and logout with Supabase Auth
- Protected app routes
- Redirect authenticated users away from auth pages
- Redirect unauthenticated users to login
- Idle session timeout
- Temporary no-email registration and password recovery flow for free-tier Supabase email limits
- Email behavior controlled by `NEXT_PUBLIC_EMAIL_SERVICES_ENABLED`

### Financial Data

- Accounts and wallets
- Categories with page-specific category types
- Transactions
- Budgets
- Savings goals
- Debts
- Subscriptions
- Assets

### Category Flow

New users start with no default categories. Each user must set up their own data from scratch.

Category types are separated by usage:

- `Income` and `Expense` categories are used for transaction-related flows.
- `Account` categories are used only by accounts.
- `Savings Goal` categories are used only by savings goals.
- `Debt` categories are used only by debts.
- `Subscription` categories are used only by subscriptions.
- `Asset` categories are used only by assets.

### Data and Security

- User-owned records are queried through the logged-in Supabase user.
- RLS is expected to enforce user isolation in the database.
- Client code uses only the Supabase public URL and publishable key.
- Server-only keys are used only on the server for temporary no-email auth recovery flows.
- No mock data is used for Supabase-backed MVP pages.

## Screens and Flows

Implemented MVP pages:

- Login
- Register
- Forgot password
- Accounts
- Categories
- Transactions
- Budgets
- Savings goals
- Debts
- Subscriptions
- Assets

Placeholder or future pages:

- Dashboard
- Reports
- Documents
- Future planning
- Scenario budgeting
- People payments
- Profile
- Settings

## Environment Variables

Create `.env.local` from `.env.example`.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_EMAIL_SERVICES_ENABLED=false
NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES=30
```

### Variable Notes

- `NEXT_PUBLIC_SUPABASE_URL`
  - Supabase project URL.
  - Local examples use `127.0.0.1:54321` or `localhost:54321`.
  - Remote examples use `https://<project-ref>.supabase.co`.
  - This value is exposed to browser code.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - Browser-safe Supabase publishable key.
  - This value is exposed to browser code.
- `SUPABASE_SECRET_KEY`
  - Server-only key used for the temporary no-email registration and password recovery flow.
  - Never expose this as a `NEXT_PUBLIC_` variable.
- `NEXT_PUBLIC_EMAIL_SERVICES_ENABLED`
  - Set to `false` while Supabase email delivery is paused.
  - Set to `true` when email confirmation/reset should use Supabase email services.
- `NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES`
  - Inactive session timeout duration.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```bash
http://localhost:3000
```

## Supabase Setup

In Supabase Dashboard:

1. Create or open your Supabase project.
2. Copy the project URL and publishable key from Project Settings → API.
3. Add the values to `.env.local`.
4. Configure Auth URL settings:
   - Local site URL: `http://localhost:3000`
   - Local redirect URL: `http://localhost:3000/auth/callback`
   - Add your production URL before deploying.

Apply migrations to the linked Supabase project:

```bash
npm run db:login
npm run db:link -- --project-ref YOUR_PROJECT_REF
npm run db:migration:check
npm run db:remote:migrations
npx supabase db push
```

Do not run linked resets as a normal deployment step. Back up the remote database before applying data-changing migrations.

Generate Supabase types after linking:

```bash
npm run db:types
```

Current migrations:

- `202606190001_auth_and_rls.sql`
- `202606220001_remove_shared_default_categories.sql`
- `202606220002_category_cleanup.sql`
- `202606230001_category_types_no_defaults.sql`
- `202606250001_transaction_metadata.sql`
- `202606250002_auto_category_style.sql`
- `202606250003_app_flow_schema_alignment.sql`
- `202606260001_subscription_reminders.sql`
- `202606260002_allow_same_account_amount_type_transfers.sql`
- `202606270001_transfer_ledger_pairs.sql`
- `202606290001_credit_card_debt_existing_data_alignment.sql`

## Supabase Migration Flow

Use the npm scripts for Supabase CLI commands. The CLI is installed as a project dev dependency, so a global Supabase install is not required.

Read the database safety docs before changing migrations:

- `docs/supabase-workflow.md`
- `docs/migration-checklist.md`

### Local-first database change

1. Start the local Supabase stack:

```bash
npm run db:start
```

2. Create a new migration file:

```bash
npm run db:new -- your_change_name
```

3. Edit the generated SQL file in `supabase/migrations`.
4. Scan migrations for risky SQL:

```bash
npm run db:migration:check
```

5. Rebuild the local database from migrations only if it is acceptable to lose local unseeded rows:

```bash
npm run db:local:reset:safe
```

6. Regenerate local TypeScript database types:

```bash
npm run db:types:local
```

7. Run app checks and test the related screens.
8. Push the verified migrations to the linked Supabase project only after a remote backup:

```bash
npm run db:remote:migrations
npx supabase db push
npm run db:types
```

### Remote-to-local schema sync

Use this only when a schema change was made directly in Supabase Dashboard and needs to be captured locally.

```bash
npm run db:pull -- remote_schema_sync
npm run db:migration:check
npm run db:local:reset:safe
npm run db:types:local
```

Review the generated migration before committing it. Do not edit migrations that have already been applied to a shared or production database; create a new migration instead.

### Existing cloud database fixes

When a local code change depends on a migration, run this against the linked project before testing the deployed or cloud-backed app:

```bash
npm run db:migration:check
npm run db:remote:migrations
npx supabase db push
npm run db:types
```

### Two-laptop data sync

Git syncs source code and migration files. It does not sync rows in laptop1's local Supabase database.

Laptop1:

```bash
git pull
npm run db:migration:check
# Optional, only if preserving local rows for laptop2:
npx supabase db dump --local --data-only --file laptop1-local-data.sql
git push
```

Laptop2:

```bash
git pull
npm run db:migration:check
npm run db:start
npm run db:local:migrations
# Only rebuild local DB when local data loss is acceptable:
npm run db:local:reset:safe
```

If laptop2 needs laptop1's local rows, copy the dump securely and restore it into laptop2 local Supabase only after checking for duplicate IDs and auth-user ownership issues.

### Safe command summary

- `npm run db:migration:check` scans migrations for destructive SQL.
- `npm run db:local:status` checks the local Supabase stack.
- `npm run db:local:migrations` lists local migration state.
- `npm run db:local:reset:safe` prompts before running local reset.
- `npm run db:remote:migrations` lists linked remote migration state.

No package script runs `supabase db reset --linked`.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:login
npm run db:link
npm run db:status
npm run db:local:status
npm run db:migration:check
npm run db:local:migrations
npm run db:local:reset:safe
npm run db:remote:migrations
npm run db:start
npm run db:stop
npm run db:new -- migration_name
npm run db:diff
npm run db:pull -- migration_name
npm run db:migration:list
npm run db:types
npm run db:types:local
```

## Verification

Run these before opening a pull request or deploying:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

## Production Notes

- Set all required environment variables in Vercel or your hosting provider.
- Do not expose Supabase secret or service-role keys to the browser.
- Confirm RLS policies are enabled before using real financial data.
- Confirm temporary no-email auth recovery is configured if `NEXT_PUBLIC_EMAIL_SERVICES_ENABLED=false`.
- Run Supabase migrations before testing existing cloud data.

## Project Direction

FinancePro is currently focused on finalizing the MVP foundation:

- Secure authentication
- User-owned Supabase data
- RLS-aware CRUD flows
- Clean personal finance UI
- Consistent loading, empty, and error states

Future work can expand dashboard analytics, reports, uploads, exports, profile settings, and planning tools.
