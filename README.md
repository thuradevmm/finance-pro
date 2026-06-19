# FinancePro

Next.js 16 personal finance application backed by Supabase Auth, PostgreSQL, Storage, and Row Level Security (RLS). Prisma is not used.

## Local setup

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the project URL and publishable key from **Supabase Dashboard → Project Settings → API**.
3. In **Authentication → URL Configuration**, set the local site URL to `http://localhost:3000` and allow `http://localhost:3000/auth/callback` as a redirect URL. Add the equivalent production URL before deploying.
4. Start the app with `npm run dev`.

Only the publishable key belongs in browser-accessible environment variables. Never add a Supabase secret or service-role key to a `NEXT_PUBLIC_` variable.

## Cloud database and RLS

The migration in `supabase/migrations` adds the Auth profile trigger, per-user RLS policies, security-invoker views, and a private `receipts` storage bucket. It expects the existing FinancePro tables and views to have already been created in the cloud project's `public` schema.

To apply it:

```bash
npm run db:login
npm run db:link -- --project-ref YOUR_PROJECT_REF
npm run db:push
```

Generate typed Supabase query definitions after linking:

```bash
npm run db:types
```

The old local PostgreSQL schema can be exported as a SQL baseline before the RLS migration with `supabase db dump --db-url YOUR_DATABASE_URL --schema public`. Supabase CLI requires Docker Desktop for that command on this machine.

## Verification

```bash
npx tsc --noEmit
npm run lint
npm run build
```
