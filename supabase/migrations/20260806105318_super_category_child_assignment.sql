-- Assign all children of a super category in one transaction. The function
-- validates ownership and category type so a child can never cross users or
-- be grouped under an incompatible reporting category.

create or replace function public.set_super_category_children(
  p_super_category_id uuid,
  p_child_category_ids uuid[] default '{}'::uuid[]
)
returns table(linked_count integer, unlinked_count integer)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_super_type text;
  v_child_ids uuid[];
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select category.category_type
  into v_super_type
  from public.categories as category
  where category.id = p_super_category_id
    and category.user_id = v_user_id
    and category.deleted_at is null
    and category.merged_into_category_id is null
    and category.category_level = 'super'
  for update;

  if not found then
    raise exception 'Super category not found.';
  end if;

  select coalesce(array_agg(distinct selected.child_id), '{}'::uuid[])
  into v_child_ids
  from unnest(coalesce(p_child_category_ids, '{}'::uuid[])) as selected(child_id)
  where selected.child_id is not null;

  if p_super_category_id = any(v_child_ids) then
    raise exception 'A super category cannot contain itself.';
  end if;

  if exists (
    select 1
    from unnest(v_child_ids) as selected(child_id)
    left join public.categories as child
      on child.id = selected.child_id
     and child.user_id = v_user_id
     and child.deleted_at is null
     and child.merged_into_category_id is null
     and child.category_level = 'subcategory'
     and child.category_type = v_super_type
     and (child.is_active or child.parent_id = p_super_category_id)
    where child.id is null
  ) then
    raise exception 'Every linked child must be an owned subcategory with the same category type.';
  end if;

  update public.categories as child
  set parent_id = null,
      metadata = coalesce(child.metadata, '{}'::jsonb) - 'parent_id'
  where child.user_id = v_user_id
    and child.deleted_at is null
    and child.parent_id = p_super_category_id
    and not (child.id = any(v_child_ids));
  get diagnostics unlinked_count = row_count;

  update public.categories as child
  set parent_id = p_super_category_id,
      metadata = jsonb_set(
        coalesce(child.metadata, '{}'::jsonb),
        '{parent_id}',
        to_jsonb(p_super_category_id::text),
        true
      )
  where child.user_id = v_user_id
    and child.deleted_at is null
    and child.id = any(v_child_ids)
    and child.category_level = 'subcategory'
    and child.category_type = v_super_type
    and child.merged_into_category_id is null;
  get diagnostics linked_count = row_count;

  return next;
end;
$$;

grant execute on function public.set_super_category_children(uuid, uuid[]) to authenticated;

comment on function public.set_super_category_children(uuid, uuid[]) is
  'Atomically replaces the owned, same-type subcategories linked to a super category.';
