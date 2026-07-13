## Summary

Describe the user-visible and technical changes.

## Verification

- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run db:migration:check`

## Database safety

- [ ] No database change is included, or a new migration file is included.
- [ ] No previously sealed migration was edited, renamed, or removed.
- [ ] New migrations were tested by rebuilding an empty local database.
- [ ] New migrations were sealed with `npm run db:migration:seal`.
- [ ] Data migrations preserve financial records and are safe to rerun conceptually.
- [ ] A current backup and rollback/recovery plan exist before remote deployment.
