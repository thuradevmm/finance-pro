# FinancePro

FinancePro is a personal financial management web application built with Next.js, TypeScript, Tailwind CSS, Supabase Auth, Supabase PostgreSQL, and Supabase Row Level Security.

The app replaces spreadsheet-based tracking with structured records for accounts, categories, transactions, budgets, savings goals, debts, subscriptions, and assets. It is designed for one owner/main user and uses Myanmar Kyat as the main system currency.

> MVP status: core financial CRUD flows are connected to cloud Supabase. Dashboard, reports, documents, future planning, scenario budgeting, people payments, profile, settings, and admin-panel functionality are still placeholder-level or not implemented.

## Cloud Supabase Only

This project is configured to use a hosted Supabase project for authentication, database access, and application data. Local development means running the Next.js app on the developer machine while it connects to the cloud Supabase project.

Do not configure the app to use a local Supabase database URL such as `http://localhost:54321` or `http://127.0.0.1:54321`. `NEXT_PUBLIC_SUPABASE_URL` must point to the hosted Supabase project:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

Supabase CLI commands in this project are used for cloud project linking, migration checks, cloud migration deployment, and type generation. Local Supabase database reset/start workflows are not part of the normal project workflow.

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
- Account amount types
- Credit card accounts and credit terms
- Categories with page-specific category types
- Income, expense, and transfer transactions
- Transaction-driven account balances
- Budgets with actual spending calculation
- Savings goals with linked savings activity
- Debts with repayment planning and credit card debt tracking
- Subscriptions with recurring billing and reminders
- Assets with purchase and usage tracking
- Transaction links to budgets, savings goals, debts, subscriptions, and assets

### Data and Security

- User-owned records are queried through the logged-in Supabase user.
- RLS is expected to enforce user isolation in the cloud database.
- Client code uses only the Supabase public URL and publishable key.
- Server-only keys are used only on the server for temporary no-email auth recovery flows.
- No mock data is used for Supabase-backed MVP pages.

## Current System Flow

### Entry and Authentication

1. `/` redirects to `/dashboard`.
2. Supabase session handling protects all non-public routes.
3. Unauthenticated users are redirected to `/login` with the requested path preserved in `next`.
4. Authenticated users are redirected away from `/login`, `/register`, and `/forgot-password` to `/dashboard`.
5. `/update-password` remains available for password recovery.
6. Login supports remember-me session persistence and an idle timeout.
7. Registration uses Supabase email confirmation when email services are enabled.
8. When email services are disabled, registration creates the account through the server-only key and shows a private recovery code.
9. Forgot password uses either Supabase reset email or the private recovery-code flow, depending on `NEXT_PUBLIC_EMAIL_SERVICES_ENABLED`.

### Initial Data Setup

New users start without shared default categories. The intended setup order is:

1. Create categories for each area that will be used.
2. Create accounts and wallets.
3. Record transactions against those accounts and categories.
4. Add budgets, savings goals, debts, subscriptions, and assets as needed.
5. Link transactions to those records so progress and summaries are updated from actual financial activity.

### Category Flow

Category type controls where a category is available:

- `Income` and `Expense` categories are used by transactions and budget actuals.
- `Account` categories are used by accounts only.
- `Savings Goal` categories are used by savings goals only.
- `Debt` categories are used by debts only.
- `Subscription` categories are used by subscriptions only.
- `Asset` categories are used by assets only.

### Account Flow

Accounts support:

- Bank Account, Savings, Credit Card, Digital Wallet, and Cash Wallet types
- Active, Needs Review, and Archived statuses
- Account categories
- Card details where applicable
- Credit limit, statement day, due day, and minimum payment for credit card accounts
- Custom amount types for non-credit-card accounts
- List, card, and lookup views
- Search and filters by category, account type, and status
- Direct links from accounts to filtered transactions

Live account balances are transaction-driven. Legacy or imported `initial_balance` values remain stored for audit history, but current balance displays are calculated from posted transaction activity. Scheduled, cancelled, void, and failed transactions do not affect balances.

### Transaction Flow

Transactions support:

- Income, Expense, and Transfer types
- Amount, date, account, account amount type, category, status, and note
- Transfer from-account and to-account selection
- Transfer amount type selection for both sides
- Same-account transfers when the source and destination amount types differ
- Status values of `cleared`, `pending`, and `scheduled`
- Search and filters by account, category, amount, date range, from account, to account, related account, and type

Transactions can be linked to:

- Budget
- Savings goal
- Debt
- Subscription
- Asset

Credit card expenses and credit-card-related transfers are treated as debt activity. Credit card charges increase used credit, and credit card payments reduce used credit.

### Budget Flow

Budgets are created against expense categories. Each budget stores:

- Monthly or yearly period
- Budget amount
- Start and end dates
- Active or Paused status
- Optional description

Actual spending is calculated from non-scheduled expense transactions that use the same category and fall inside the budget period.

### Savings Goal Flow

Savings goals support:

- Goal name
- Active non-credit-card account link
- Savings goal category style
- Target amount
- Target date
- Notes

Saved amount and progress include linked savings-goal transactions, so the goal moves forward when relevant transactions are recorded.

### Debt Flow

Debts support:

- Debt name and lender
- Total amount
- Interest rate
- Start date and duration
- Status of Active, Overdue, or Paid
- Debt category
- Payment account
- Notes
- Repayment schedule preview
- Debt payment calendar

Debt summaries include remaining balance, repayment progress, and credit card used amount when credit card debt exists. Linked debt transactions update debt activity.

### Subscription Flow

Subscriptions support:

- Subscription name
- Billed amount
- Billing currency
- Exchange rate for non-MMK billing
- Weekly, monthly, or yearly billing cycle
- Next billing date
- Subscription category
- Payment account
- Active, Paused, or Expiring status
- Billing reminders
- Notes

Subscription summaries show recurring cost and upcoming billing commitments.

### Asset Flow

Assets support:

- Asset name
- Asset category
- Purchase date and amount
- Current value
- Start-using date
- Condition
- Active, Sold, or Archived status
- Notes

Linked asset transactions can contribute to purchase amount tracking.

## Screens and Status

Implemented MVP pages:

- Login
- Register
- Forgot password
- Update password
- Accounts
- Add/Edit Account
- Categories
- Add/Edit Category
- Transactions
- Add/Edit Transaction
- Budgets
- Add/Edit Budget
- Savings goals
- Add/Edit Savings Goal
- Debts
- Add/Edit Debt
- Subscriptions
- Add/Edit Subscription
- Assets
- Add/Edit Asset

Placeholder or future pages:

- Dashboard
- Reports
- Documents
- Future planning
- Scenario budgeting
- People payments
- Profile
- Settings
- Admin panel

## Environment Variables

Create `.env.local` from `.env.example` and fill it with the cloud Supabase project values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_EMAIL_SERVICES_ENABLED=false
NEXT_PUBLIC_SESSION_IDLE_TIMEOUT_MINUTES=30
```

### Variable Notes

- `NEXT_PUBLIC_SUPABASE_URL`
  - Hosted Supabase project URL.
  - Must use the `https://YOUR_PROJECT_REF.supabase.co` format.
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

Start the Next.js development server:

```bash
npm run dev
```

Open the app:

```bash
http://localhost:3000
```

The app will still use the cloud Supabase project while running on `localhost:3000`.

## Supabase Cloud Setup

In Supabase Dashboard:

1. Create or open the cloud Supabase project.
2. Copy the project URL and publishable key from Project Settings -> API.
3. Add the values to `.env.local`.
4. Configure Auth URL settings:
   - Local development site URL: `http://localhost:3000`
   - Local development redirect URL: `http://localhost:3000/auth/callback`
   - Production site URL and redirect URL for the deployed app
5. Confirm Row Level Security policies are enabled before entering real financial data.

## Cloud Migration Workflow

Use the Supabase CLI against the linked cloud project. The CLI is installed as a project dependency, so a global Supabase install is not required.

Initial link and migration deployment:

```bash
npm run db:login
npm run db:link -- --project-ref YOUR_PROJECT_REF
npm run db:migration:check
npm run db:remote:migrations
npx supabase db push --include-all
npm run db:types
```

For a new schema change:

1. Create a new migration:

```bash
npm run db:new -- migration_name
```

2. Edit the generated SQL file in `supabase/migrations`.
3. Scan migrations for risky SQL:

```bash
npm run db:migration:check
```

4. Back up the cloud database if the migration changes existing data.
5. Compare migration state with the linked cloud project:

```bash
npm run db:remote:migrations
```

6. Apply the migration to the linked cloud project:

```bash
npx supabase db push --include-all
```

7. Regenerate TypeScript database types from the linked cloud schema:

```bash
npm run db:types
```

Do not run linked database resets as a normal workflow. Never run `supabase db reset --linked` without an explicit backup and a clear recovery plan.

Current migrations:

- `202606180001_baseline_schema.sql`
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
- `202606290002_transaction_driven_account_balances.sql`

## Common Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run db:login
npm run db:link
npm run db:migration:check
npm run db:remote:migrations
npm run db:new -- migration_name
npm run db:types
```

## Verification

Run these before opening a pull request or deploying:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

For documentation-only changes, run:

```bash
git diff --check
```

## Production Notes

- Set all required environment variables in Vercel or the chosen hosting provider.
- Use only the cloud Supabase project URL in every environment.
- Do not expose Supabase secret or service-role keys to the browser.
- Confirm RLS policies are enabled before using real financial data.
- Confirm temporary no-email auth recovery is configured if `NEXT_PUBLIC_EMAIL_SERVICES_ENABLED=false`.
- Run Supabase migrations against the linked cloud project before testing cloud data.

## Project Direction

FinancePro is currently focused on finalizing the MVP foundation:

- Secure authentication
- User-owned Supabase data
- RLS-aware CRUD flows
- Clean personal finance UI
- Consistent loading, empty, and error states

Future work can expand dashboard analytics, reports, uploads, exports, profile settings, and planning tools.
