# Supabase Migration Safety Checklist

Use this checklist before changing database schema or data.

## Before Creating A Migration

- Confirm whether you are changing local or remote Supabase.
- Pull the latest Git changes.
- Check current migration state with `npm run db:local:migrations`.
- Decide whether the change is schema-only or data-changing.
- Back up local data if it matters.

## Before Running A Local Reset

- Remember that local reset deletes unseeded local rows.
- Export local data first if it should survive.
- Use `npm run db:local:reset:safe`, not a raw reset command.
- Confirm `.env.local` points where you think it points.
- Do not use `--linked`.

## Before Pushing To Remote

- Back up the remote project.
- Run `npm run db:migration:check`.
- Run `npm run db:remote:migrations` after linking.
- Review every migration that updates rows, changes RLS, changes ownership IDs, or adds constraints.
- Prefer applying first to a staging or temporary project when data is important.

## Before Merging A Migration PR

- Ensure migration files are ordered by timestamp.
- Do not edit migrations already applied to shared or production databases unless the edit is comment-only and documented.
- Confirm `supabase/seed.sql`, if present, does not delete or overwrite real data.
- Confirm app queries still match RLS ownership fields like `auth.uid()` and `user_id`.
- Run app checks after migration testing.

## Destructive SQL Review

Treat these as high risk:

- `drop table`
- `drop schema`
- `truncate`
- `delete from`
- `drop column`
- `alter table ... drop`
- `cascade`

Run:

```bash
npm run db:migration:check
```

Intentional exceptions require a nearby comment:

```sql
-- @allow-destructive-migration: explain why this is safe
```

The scanner still prints a warning for approved exceptions.

## RLS Testing

- Test as the normal authenticated user, not only through service role access.
- Verify records are visible for the expected `auth.uid()`.
- Verify another user cannot read or modify those records.
- Do not disable RLS permanently.
- If temporary admin testing is needed, document it and remove any temporary policy changes.
