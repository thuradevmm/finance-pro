-- Preserve the one-to-many reporting hierarchy for legacy and future data:
-- one super category may have many children, while each subcategory has one
-- canonical parent_id at most. Invalid legacy links are detached rather than
-- deleted, and their former parent remains in metadata for auditability.

update public.categories as child
set parent_id = null,
    metadata = (coalesce(child.metadata, '{}'::jsonb) - 'parent_id') || jsonb_build_object(
      'hierarchy_repair', jsonb_build_object(
        'previous_parent_id', child.parent_id,
        'reason', 'invalid_super_category_relationship',
        'repaired_at', now()
      )
    )
where child.parent_id is not null
  and not exists (
    select 1
    from public.categories as parent
    where parent.id = child.parent_id
      and parent.user_id is not distinct from child.user_id
      and parent.deleted_at is null
      and parent.merged_into_category_id is null
      and parent.category_level = 'super'
      and child.category_level = 'subcategory'
      and parent.category_type = child.category_type
  );

-- Financial purpose belongs to reporting groups and is inherited by children.
update public.categories
set financial_role = null
where category_level = 'subcategory'
  and financial_role is not null;

update public.categories
set financial_role = 'other'
where category_level = 'super'
  and financial_role is null;

-- The normalized columns are authoritative; keep legacy metadata readers in
-- exact agreement so existing records continue to render correctly.
update public.categories
set metadata = (
  coalesce(metadata, '{}'::jsonb)
    - 'parent_id'
    - 'category_level'
    - 'financial_role'
) || jsonb_build_object(
  'category_level', category_level
) || case
  when parent_id is not null then jsonb_build_object('parent_id', parent_id::text)
  else '{}'::jsonb
end || case
  when category_level = 'super' then jsonb_build_object('financial_role', financial_role)
  else '{}'::jsonb
end;

create or replace function public.enforce_category_hierarchy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.categories%rowtype;
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.category_level = 'super' then
    if new.parent_id is not null then
      raise exception 'A super category cannot belong to another category.';
    end if;
    new.financial_role := coalesce(new.financial_role, 'other');
  else
    new.financial_role := null;
  end if;

  if new.parent_id is not null then
    if new.category_level <> 'subcategory' then
      raise exception 'Only a subcategory can have a super category parent.';
    end if;

    select parent.*
    into v_parent
    from public.categories as parent
    where parent.id = new.parent_id;

    if not found
       or v_parent.user_id is distinct from new.user_id
       or v_parent.deleted_at is not null
       or v_parent.merged_into_category_id is not null then
      raise exception 'Choose an owned, available super category.';
    end if;
    if v_parent.category_level <> 'super' then
      raise exception 'A subcategory parent must be a super category.';
    end if;
    if v_parent.category_type <> new.category_type then
      raise exception 'A super category and its subcategory must use the same category type.';
    end if;
    if not v_parent.is_active
       and (tg_op = 'INSERT' or old.parent_id is distinct from new.parent_id) then
      raise exception 'Choose an active super category for a new relationship.';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and exists (
       select 1
       from public.categories as child
       where child.parent_id = old.id
         and child.id <> new.id
     )
     and (
       new.category_level <> 'super'
       or new.category_type is distinct from old.category_type
       or new.user_id is distinct from old.user_id
       or new.deleted_at is not null
       or new.merged_into_category_id is not null
     ) then
    raise exception 'Reassign or unlink this super category''s subcategories first.';
  end if;

  new.metadata := (new.metadata - 'parent_id' - 'category_level' - 'financial_role')
    || jsonb_build_object('category_level', new.category_level)
    || case
      when new.parent_id is not null then jsonb_build_object('parent_id', new.parent_id::text)
      else '{}'::jsonb
    end
    || case
      when new.category_level = 'super' then jsonb_build_object('financial_role', new.financial_role)
      else '{}'::jsonb
    end;

  return new;
end;
$$;

create trigger enforce_category_hierarchy_before_write
before insert or update of
  parent_id,
  user_id,
  category_type,
  category_level,
  financial_role,
  metadata,
  deleted_at,
  merged_into_category_id
on public.categories
for each row
execute function public.enforce_category_hierarchy();

comment on function public.enforce_category_hierarchy() is
  'Enforces one valid same-owner, same-type super parent per subcategory and synchronizes hierarchy metadata.';
