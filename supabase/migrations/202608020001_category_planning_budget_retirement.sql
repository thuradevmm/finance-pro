-- Future Planning now owns budget control. Planning types are category-backed,
-- historical budget values are copied into monthly planning amounts, and the
-- retired budget tables are retained read-only so no financial history is lost.

-- The generic page-category name was ambiguous once the module began handling
-- both borrowing and lending. Only the exact legacy name is changed.
update public.categories
set name = 'Borrowing & Lending',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_name', 'Debt',
      'renamed_for_borrowing_lending', true
    ),
    updated_at = now()
where category_type = 'debt'
  and lower(btrim(name)) = 'debt'
  and deleted_at is null;

alter table public.future_planning_columns
  add column if not exists category_id uuid references public.categories(id) on delete restrict;

alter table public.future_planning_amounts
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- @allow-destructive-migration: free-text planning names are no longer identity;
-- the category link below is the authoritative unique key.
drop index if exists public.future_planning_columns_user_name_active_idx;

-- Reconnect old free-text planning columns to a matching category when one is
-- available. The direction determines the preferred category family.
update public.future_planning_columns as planning_column
set category_id = (
  select category.id
  from public.categories as category
  where category.user_id = planning_column.user_id
    and category.deleted_at is null
    and category.merged_into_category_id is null
    and lower(btrim(category.name)) = lower(btrim(planning_column.name))
    and case planning_column.direction
      when 'income' then category.category_type = 'income'
      when 'saving' then category.category_type = 'savings_goal'
      else category.category_type = 'expense'
    end
  order by category.is_active desc, category.created_at, category.id
  limit 1
)
where planning_column.category_id is null
  and exists (
    select 1
    from public.categories as category
    where category.user_id = planning_column.user_id
      and category.deleted_at is null
      and category.merged_into_category_id is null
      and lower(btrim(category.name)) = lower(btrim(planning_column.name))
      and case planning_column.direction
        when 'income' then category.category_type = 'income'
        when 'saving' then category.category_type = 'savings_goal'
        else category.category_type = 'expense'
      end
  );

-- Preserve unmatched free-text plans by turning their existing type into a
-- normal category. From this migration onward users can only choose categories;
-- this one-time conversion prevents older amounts from disappearing.
do $$
declare
  planning_column record;
  matched_category_id uuid;
  normalized_category_type text;
  display_category_type text;
  category_scopes jsonb;
begin
  for planning_column in
    select id, user_id, name, direction
    from public.future_planning_columns
    where category_id is null
    order by created_at, id
  loop
    normalized_category_type := case planning_column.direction
      when 'income' then 'income'
      when 'saving' then 'savings_goal'
      else 'expense'
    end;
    display_category_type := case normalized_category_type
      when 'income' then 'Income'
      when 'savings_goal' then 'Savings Goal'
      else 'Expense'
    end;
    category_scopes := case normalized_category_type
      when 'savings_goal' then jsonb_build_array('Savings Goals')
      else jsonb_build_array('Transactions')
    end;

    select category.id into matched_category_id
    from public.categories as category
    where category.user_id = planning_column.user_id
      and category.deleted_at is null
      and category.merged_into_category_id is null
      and lower(btrim(category.name)) = lower(btrim(planning_column.name))
      and category.category_type = normalized_category_type
    order by category.is_active desc, category.created_at, category.id
    limit 1;

    if matched_category_id is null then
      insert into public.categories (
        user_id, name, type, category_type, is_active, is_default, metadata
      ) values (
        planning_column.user_id,
        planning_column.name,
        case when normalized_category_type = 'income' then 'income' else 'expense' end,
        normalized_category_type,
        true,
        false,
        jsonb_build_object(
          'category_type', display_category_type,
          'description', 'Converted from a legacy custom future-planning type.',
          'scopes', category_scopes,
          'source', 'future_planning_type_migration'
        )
      ) returning id into matched_category_id;
    end if;

    update public.future_planning_columns
    set category_id = matched_category_id,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'legacy_custom_name', planning_column.name,
          'category_linked_at', now()
        )
    where id = planning_column.id;
  end loop;
end $$;

-- Keep names and total groups derived from the linked category.
update public.future_planning_columns as planning_column
set name = category.name,
    direction = case category.category_type
      when 'income' then 'income'
      when 'savings_goal' then 'saving'
      else 'expense'
    end,
    updated_at = now()
from public.categories as category
where category.id = planning_column.category_id;

alter table public.future_planning_columns
  alter column category_id set not null;

create index if not exists future_planning_columns_category_idx
  on public.future_planning_columns (category_id);

create unique index if not exists future_planning_columns_user_category_active_idx
  on public.future_planning_columns (user_id, category_id)
  where is_active = true;

-- Create a category planning column for every category used by a legacy budget.
insert into public.future_planning_columns (
  user_id, name, direction, category_id, sort_order, is_active, metadata
)
select distinct on (budget_item.user_id, budget_item.category_id)
  budget_item.user_id,
  category.name,
  case category.category_type
    when 'income' then 'income'
    when 'savings_goal' then 'saving'
    else 'expense'
  end,
  category.id,
  coalesce((
    select max(existing_column.sort_order) + 1
    from public.future_planning_columns as existing_column
    where existing_column.user_id = budget_item.user_id
  ), 0),
  true,
  jsonb_build_object('source', 'legacy_budget_migration')
from public.budget_items as budget_item
join public.categories as category on category.id = budget_item.category_id
where budget_item.category_id is not null
  and not exists (
    select 1
    from public.future_planning_columns as existing_column
    where existing_column.user_id = budget_item.user_id
      and existing_column.category_id = budget_item.category_id
      and existing_column.is_active = true
  )
order by budget_item.user_id, budget_item.category_id, budget_item.created_at, budget_item.id;

-- Copy monthly budgets as monthly controls. Yearly budgets are divided evenly
-- across the covered months so their annual total is preserved. Existing
-- non-zero future-planning values always win over legacy budget data.
with legacy_budget_months as (
  select
    budget_item.id as budget_item_id,
    budget_item.user_id,
    planning_column.id as column_id,
    generated_month::date as period_month,
    case
      when lower(budget_plan.period_type) = 'yearly' then
        budget_item.planned_amount / greatest(
          ((extract(year from effective_end)::integer - extract(year from budget_plan.start_date)::integer) * 12)
          + extract(month from effective_end)::integer
          - extract(month from budget_plan.start_date)::integer
          + 1,
          1
        )
      else budget_item.planned_amount
    end as migrated_amount,
    budget_plan.id as budget_plan_id
  from public.budget_items as budget_item
  join public.budget_plans as budget_plan
    on budget_plan.id = budget_item.budget_plan_id
   and budget_plan.user_id = budget_item.user_id
  join public.future_planning_columns as planning_column
    on planning_column.user_id = budget_item.user_id
   and planning_column.category_id = budget_item.category_id
   and planning_column.is_active = true
  cross join lateral (
    select coalesce(
      budget_plan.end_date,
      case when lower(budget_plan.period_type) = 'yearly'
        then (budget_plan.start_date + interval '1 year - 1 day')::date
        else (budget_plan.start_date + interval '1 month - 1 day')::date
      end
    ) as effective_end
  ) as budget_range
  cross join lateral generate_series(
    date_trunc('month', budget_plan.start_date)::date,
    date_trunc('month', effective_end)::date,
    interval '1 month'
  ) as month_series(generated_month)
  where budget_plan.deleted_at is null
), consolidated_budget_months as (
  select
    user_id,
    column_id,
    period_month,
    sum(migrated_amount) as migrated_amount,
    jsonb_agg(jsonb_build_object(
      'budget_item_id', budget_item_id,
      'budget_plan_id', budget_plan_id
    )) as legacy_budgets
  from legacy_budget_months
  group by user_id, column_id, period_month
)
insert into public.future_planning_amounts (
  user_id, column_id, period_month, amount, metadata
)
select
  user_id,
  column_id,
  period_month,
  round(migrated_amount, 2),
  jsonb_build_object(
    'source', 'legacy_budget_migration',
    'legacy_budgets', legacy_budgets
  )
from consolidated_budget_months
on conflict (user_id, column_id, period_month)
do update set
  amount = case
    when public.future_planning_amounts.amount = 0 then excluded.amount
    else public.future_planning_amounts.amount
  end,
  metadata = coalesce(public.future_planning_amounts.metadata, '{}'::jsonb)
    || jsonb_build_object('legacy_budget_migration', excluded.metadata),
  updated_at = now();

-- Make migrated budget years visible immediately without replacing years the
-- user already selected in Future Planning.
insert into public.future_planning_settings (user_id, selected_years)
select
  amount.user_id,
  array_agg(distinct extract(year from amount.period_month)::integer order by extract(year from amount.period_month)::integer)
from public.future_planning_amounts as amount
where amount.metadata ->> 'source' = 'legacy_budget_migration'
group by amount.user_id
on conflict (user_id)
do update set
  selected_years = array(
    select distinct selected_year
    from unnest(
      coalesce(public.future_planning_settings.selected_years, '{}'::integer[])
      || excluded.selected_years
    ) as selected_years(selected_year)
    order by selected_year
  ),
  updated_at = now();

-- Retired budget links become future-planning links. The original IDs stay in
-- metadata for audit and reversal workflows; no transaction is deleted.
with transaction_budget_links as (
  select
    transaction.id as transaction_id,
    budget_item.category_id,
    budget_item.id as budget_item_id,
    planning_amount.id as planning_amount_id
  from public.transactions as transaction
  join public.budget_items as budget_item
    on transaction.user_id = budget_item.user_id
   and transaction.related_entity_type = 'budget'
   and transaction.related_entity_id = budget_item.id
  join public.future_planning_columns as planning_column
    on planning_column.user_id = budget_item.user_id
   and planning_column.category_id = budget_item.category_id
   and planning_column.is_active = true
  join public.future_planning_amounts as planning_amount
    on planning_amount.user_id = budget_item.user_id
   and planning_amount.column_id = planning_column.id
   and planning_amount.period_month = date_trunc('month', transaction.transaction_date)::date
)
update public.transactions as transaction
set category_id = coalesce(transaction.category_id, budget_link.category_id),
    metadata = coalesce(transaction.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'future_planning_amount_id', budget_link.planning_amount_id,
        'legacy_budget_item_id', budget_link.budget_item_id,
        'legacy_budget_link_migrated', true
      ),
    related_entity_id = null,
    related_entity_type = null,
    updated_at = now()
from transaction_budget_links as budget_link
where transaction.id = budget_link.transaction_id;

update public.budget_plans
set status = 'retired',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'retired_into', 'future_planning',
      'retired_at', now()
    ),
    updated_at = now()
where deleted_at is null
  and status <> 'retired';

update public.budget_items
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'retired_into', 'future_planning',
      'retired_at', now()
    ),
    updated_at = now()
where not (coalesce(metadata, '{}'::jsonb) ? 'retired_into');

-- Category merges and renames stay authoritative for planning columns.
create or replace function public.sync_future_planning_column_category()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  source_column record;
  target_column record;
begin
  if new.merged_into_category_id is not null
     and new.merged_into_category_id is distinct from old.merged_into_category_id then
    select * into source_column
    from public.future_planning_columns
    where user_id = new.user_id and category_id = new.id and is_active = true
    limit 1;

    if source_column.id is not null then
      select * into target_column
      from public.future_planning_columns
      where user_id = new.user_id
        and category_id = new.merged_into_category_id
        and is_active = true
      limit 1;

      if target_column.id is null then
        update public.future_planning_columns
        set category_id = new.merged_into_category_id
        where id = source_column.id;
      else
        insert into public.future_planning_amounts (
          user_id, column_id, period_month, amount, metadata
        )
        select
          amount.user_id,
          target_column.id,
          amount.period_month,
          amount.amount,
          coalesce(amount.metadata, '{}'::jsonb) || jsonb_build_object(
            'merged_from_planning_column_id', source_column.id
          )
        from public.future_planning_amounts as amount
        where amount.column_id = source_column.id
        on conflict (user_id, column_id, period_month)
        do update set
          amount = public.future_planning_amounts.amount + excluded.amount,
          metadata = coalesce(public.future_planning_amounts.metadata, '{}'::jsonb)
            || jsonb_build_object('category_plan_merged', true),
          updated_at = now();

        with transaction_plan_links as (
          select transaction.id as transaction_id, target_amount.id as target_amount_id
          from public.transactions as transaction
          join public.future_planning_amounts as source_amount
            on transaction.metadata ->> 'future_planning_amount_id' = source_amount.id::text
          join public.future_planning_amounts as target_amount
            on target_amount.user_id = source_amount.user_id
           and target_amount.column_id = target_column.id
           and target_amount.period_month = source_amount.period_month
          where source_amount.column_id = source_column.id
            and transaction.user_id = new.user_id
        )
        update public.transactions as transaction
        set metadata = jsonb_set(
              coalesce(transaction.metadata, '{}'::jsonb),
              '{future_planning_amount_id}',
              to_jsonb(plan_link.target_amount_id::text),
              true
            ),
            updated_at = now()
        from transaction_plan_links as plan_link
        where transaction.id = plan_link.transaction_id;

        update public.future_planning_columns
        set is_active = false,
            metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
              'merged_into_planning_column_id', target_column.id,
              'merged_at', now()
            )
        where id = source_column.id;
      end if;
    end if;
  end if;

  update public.future_planning_columns
  set name = target.name,
      direction = case target.category_type
        when 'income' then 'income'
        when 'savings_goal' then 'saving'
        else 'expense'
      end
  from public.categories as target
  where public.future_planning_columns.user_id = new.user_id
    and public.future_planning_columns.category_id = target.id
    and target.id = coalesce(new.merged_into_category_id, new.id);

  return new;
end;
$$;

drop trigger if exists sync_future_planning_column_category on public.categories;
create trigger sync_future_planning_column_category
  after update of name, category_type, merged_into_category_id on public.categories
  for each row execute procedure public.sync_future_planning_column_category();
