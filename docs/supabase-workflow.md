# Supabase Workflow And Financial Data Safety

This repository is the canonical source for database structure. Supabase records applied migration versions separately in `supabase_migrations.schema_migrations`. Both histories must agree before deployment.

Migrations are not backups and Git does not store user-entered rows.

Use `npm ci` when onboarding or in CI. The Supabase CLI is pinned to an exact project version so every developer and runner executes the same migration tooling. Upgrade it only in a reviewed pull request with a successful clean replay.

## Non-Negotiable Rules

1. Never run `supabase db reset --linked` or `db reset --db-url` against a shared environment.
2. Never edit, rename, reorder, or delete a sealed migration. Add a newer migration instead.
3. Never use `db push --include-all` or `migration repair` to bypass a mismatch. Stop and investigate.
4. Never make production schema changes in the Dashboard SQL/Table editors.
5. Never deploy a developer's unmerged local migration files.
6. Back up the target before every production data migration and record the recovery reference.
7. Prefer soft deletion for financial records. Normal migrations must not hard-delete transactions or related financial history.

These rules follow Supabase's team guidance: develop migrations locally, commit them to Git, keep remote migration history synchronized, and coordinate a single deployment path. See the official [Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments) guides.

## Environment Model

| Environment | Purpose | Data rule | Migration authority |
| --- | --- | --- | --- |
| Local Supabase | Development and clean replay | Disposable or deterministic seed data only | Any developer on a feature branch |
| Staging | Integration and release validation | Sanitized/non-production data | Canonical reviewed branch only |
| Production | Real financial records | Backed up and never reset | Manual GitHub deployment from `main` |

Each developer should use local Supabase or a separate development project. Sharing production as a development target makes accidental data loss and schema drift much more likely.

## Create A Migration

```bash
git switch main
git pull --ff-only
git switch -c feature/descriptive-name
npm run db:new -- descriptive_name
```

Edit only the new SQL file. Migration names use the CLI-generated timestamp and snake_case description. Data migrations should be narrowly scoped, preserve primary keys and ownership, and use predicates that cannot affect unrelated users or rows.

Test and seal it:

```bash
npm run db:start
npm run db:local:reset:safe
npm run db:migration:seal
npm run db:migration:check
npm test
npm run lint
npm run build
```

Commit the new migration and the updated `supabase/migrations.lock.json` together. The seal command only appends new checksums; it refuses to rewrite an existing checksum.

## Pull Request And CI

All database changes go through a pull request. CI:

- Validates names, ordering, checksums, and destructive SQL.
- Rejects edits or deletions of committed migrations.
- Replays all migrations into an empty local PostgreSQL database.
- Runs tests, lint, and a production application build.

Configure GitHub branch protection for `main` to require pull requests and the `Migration Safety` check, dismiss stale approvals, block force pushes, and restrict direct pushes.

## Deploy To Staging Or Production

Preferred: run the `Deploy Database Migrations` workflow from GitHub Actions. It checks out canonical `main`, serializes deployments per environment, requires a backup/recovery reference, verifies remote history, previews changes, applies normal `db push`, and verifies the final history.

Required GitHub Environment secrets for both `staging` and `production`:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_PROJECT_ID`

Local fallback for an authorized maintainer:

```bash
git switch main
git pull --ff-only
npm run db:link -- --project-ref TARGET_PROJECT_REF
npm run db:remote:check
npm run db:deploy
```

The guarded deploy refuses to run unless migration files are committed, local `HEAD` exactly matches its pushed upstream, the branch is allowed, and remote history is an ordered prefix of Git history. It never uses `--include-all` and never resets the database.

## Why Transactions Can Appear To Disappear

Check these causes in order:

1. The app points to a different local/hosted project in `.env.local`.
2. A local reset removed unseeded local-only rows.
3. A linked reset dropped remote user tables and rebuilt schema without row data.
4. RLS or ownership changes hide rows even though they still exist.
5. A migration soft-deleted rows or changed filters/status semantics.
6. A remote schema edit caused migration history drift.

Stop all migration commands while investigating. Record row counts and take a current backup before any recovery attempt.

## Recovery And History Mismatches

Run read-only checks first:

```bash
npm run db:remote:migrations
npm run db:remote:check
git status --short
git log --oneline -- supabase/migrations
```

If the remote contains a migration missing from Git, recover the exact migration from the developer/commit that deployed it. If schema was changed directly, capture and review the difference in a new migration on a recovery branch. Do not guess a repair status.

`supabase migration repair` changes only the history table; it does not apply or undo SQL. Use it only during a documented incident after schema and data have been independently verified and backed up.

For lost production rows, use Supabase backups/PITR to restore into a temporary project first. Compare and merge verified missing rows; do not overwrite the current production project blindly.

## Local Data

`npm run db:local:reset:safe` explicitly targets only the local stack and requires typed confirmation. It deletes unseeded local rows. Put only deterministic, non-sensitive development data in `supabase/seed.sql`; never commit real financial records, service keys, or production dumps.
