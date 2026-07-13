# Migration Review Checklist

## Author

- [ ] Started from current `main` on a feature branch.
- [ ] Created a new timestamped migration; no sealed migration changed.
- [ ] Used additive/backward-compatible schema changes where possible.
- [ ] Preserved financial rows, IDs, ownership, and historical references.
- [ ] Avoided hard deletes; soft-deleted only when explicitly required.
- [ ] Made data backfills narrowly scoped and deterministic.
- [ ] Rebuilt an empty local database from the complete migration history.
- [ ] Tested RLS as authenticated users, not only with a service role.
- [ ] Ran `npm run db:migration:seal` after final SQL edits.
- [ ] Ran `npm run db:migration:check`, tests, lint, and build.

## Reviewer

- [ ] Migration and lock file are committed together.
- [ ] The timestamp is newer than all sealed migrations.
- [ ] No migration was edited, renamed, reordered, or deleted.
- [ ] Constraints and backfills cannot orphan or hide existing transactions.
- [ ] Views preserve their public column contracts.
- [ ] Roll-forward recovery is documented for risky changes.
- [ ] CI successfully replayed the database from zero.

## Deployer

- [ ] Deploying canonical, fully pushed `main`, not local-only files.
- [ ] Target project/environment was verified.
- [ ] Current backup/PITR recovery reference was recorded.
- [ ] `npm run db:remote:check` reports a consistent ordered prefix.
- [ ] Dry run shows only the reviewed pending migrations.
- [ ] Used GitHub `Deploy Database Migrations` or `npm run db:deploy`.
- [ ] Did not use `--include-all`, linked reset, or unreviewed history repair.
- [ ] `npm run db:remote:verify` passes after deployment.
- [ ] Application smoke tests and financial row counts pass after deployment.
