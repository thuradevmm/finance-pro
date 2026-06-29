# Supabase Workflow And Data Safety

This project uses Git for source code and migration files. Git does not store the rows inside a local Supabase database.

## Local Versus Remote Data

- Local Supabase data lives on one laptop unless you export it.
- Remote Supabase data lives in the linked Supabase project.
- Migrations describe schema and intentional data transforms. They are not a backup of user-entered rows.
- `supabase db reset` rebuilds the local database from migrations and seed files. Any local rows that are not in seed or a dump are deleted.
- Do not run `supabase db reset --linked`. Treat linked resets as emergency-only and require a remote backup plus explicit approval.

## Environment Targets

Check `NEXT_PUBLIC_SUPABASE_URL` before debugging missing data.

- Local examples: `http://127.0.0.1:54321`, `http://localhost:54321`
- Remote examples: `https://<project-ref>.supabase.co`

`NEXT_PUBLIC_*` variables are browser-visible. Never put service role keys, database passwords, or full connection strings in `NEXT_PUBLIC_*`.

## Two-Laptop Development Flow

### Laptop 1

1. Pull the latest code.
2. Create migrations with `npm run db:new -- migration_name`.
3. Review migration SQL with `npm run db:migration:check`.
4. Run local reset only when it is acceptable to lose local unseeded rows:
   `npm run db:local:reset:safe`
5. Test the app.
6. Commit and push code and migrations.
7. Export local data if you need those rows on another laptop.

### Laptop 2

1. Pull Git changes.
2. Run `npm run db:migration:check`.
3. Start local Supabase with `npm run db:start`.
4. Run `npm run db:local:migrations` to see local migration state.
5. Run `npm run db:local:reset:safe` only if rebuilding local data is acceptable.
6. Import a laptop1 data dump if the missing rows were local-only data.

## Sample Data

If both laptops need the same non-sensitive starter data, add it intentionally to `supabase/seed.sql`. Keep seed data small and deterministic. Do not put private production data, service role keys, or personal financial records in seed files.

## Export Local Data Intentionally

Use a data-only dump when moving local rows between laptops. Include auth tables only if user IDs must match.

Example for laptop1 local database:

```bash
npx supabase db dump --local --data-only --file laptop1-local-data.sql
```

Copy the dump securely to laptop2. Restore only into a local database you are willing to modify:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --single-transaction --file laptop1-local-data.sql
```

Foreign keys, duplicate primary keys, storage rows, and `auth.users` ownership IDs can make restores fail. If auth users are involved, restore into an empty local database or create a filtered import plan.

## Remote Migration Flow

1. Back up the remote database first.
2. Run `npm run db:migration:check`.
3. Run `npm run db:remote:migrations` after linking to compare local and remote migration state.
4. Apply migrations intentionally with the Supabase CLI only after review.
5. Never use linked reset for normal deployment.

## Emergency Recovery

If data disappears:

1. Stop running reset/push commands.
2. Identify whether the app points at local or remote Supabase.
3. Check whether rows exist but are hidden by RLS/ownership.
4. If local-only rows existed on another laptop, export from that laptop before resetting it.
5. For remote incidents, take a current backup first, then use Supabase dashboard backups/PITR and restore to a temporary project before merging missing rows.
