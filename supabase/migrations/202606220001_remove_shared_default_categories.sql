-- New users start with an empty category list. Preserve historical references by
-- soft-deleting shared defaults instead of removing referenced rows physically.
update public.categories
set is_active = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where user_id is null
  and is_default = true
  and deleted_at is null;
