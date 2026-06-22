-- Retire shared defaults so category lists only contain records owned by the user.
-- Referenced rows remain soft-deleted to preserve historical financial records.
update public.categories
set is_active = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where user_id is null
  and is_default = true
  and (is_active = true or deleted_at is null);

-- Retire obsolete marker-only rows created by the previous shared-default flow.
update public.categories
set is_active = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where user_id is not null
  and metadata ? 'hidden_default_id'
  and deleted_at is null;

-- Older copy-on-write category handling stored internal source markers. They are
-- no longer needed now that all manageable categories are user-owned.
update public.categories
set metadata = metadata - 'source_default_id',
    updated_at = now()
where user_id is not null
  and metadata ? 'source_default_id';
