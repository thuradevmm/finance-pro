-- Backward-compatible account amount-type reuse and category lifecycle support.
-- Existing account/category metadata remains populated so older application
-- versions and historical records continue to resolve the same labels.

create table if not exists public.account_amount_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  normalized_name text generated always as (lower(btrim(name))) stored,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_amount_types_name_check check (btrim(name) <> '')
);

create unique index if not exists account_amount_types_user_name_active_idx
  on public.account_amount_types (user_id, normalized_name);

create index if not exists account_amount_types_user_active_idx
  on public.account_amount_types (user_id, is_active, sort_order, name)
  where deleted_at is null;

drop trigger if exists set_updated_at on public.account_amount_types;
create trigger set_updated_at
  before update on public.account_amount_types
  for each row execute procedure public.set_updated_at();

grant select, insert, update, delete on public.account_amount_types to authenticated;
alter table public.account_amount_types enable row level security;
alter table public.account_amount_types force row level security;
drop policy if exists owner_access on public.account_amount_types;
create policy owner_access on public.account_amount_types for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Seed reusable suggestions from every current account, but do not rewrite the
-- account metadata or any transaction amount-type labels.
insert into public.account_amount_types (user_id, name, metadata)
select source.user_id, source.name, jsonb_build_object('source', 'account_metadata_backfill')
from (
  select distinct on (candidate.user_id, candidate.normalized_name)
    candidate.user_id,
    candidate.name
  from (
    select
      account.user_id,
      btrim(amount_type.item ->> 'type') as name,
      lower(btrim(amount_type.item ->> 'type')) as normalized_name,
      1 as source_priority
    from public.accounts as account
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(account.metadata -> 'amount_types') = 'array'
          then account.metadata -> 'amount_types'
        else '[]'::jsonb
      end
    ) as amount_type(item)
    where account.deleted_at is null
      and btrim(coalesce(amount_type.item ->> 'type', '')) <> ''

    union all

    -- Prefer the canonical built-in spelling when a legacy account stored an
    -- Operation label with different casing.
    select distinct account.user_id, 'Operation', 'operation', 0
    from public.accounts as account
    where account.deleted_at is null
  ) as candidate
  order by
    candidate.user_id,
    candidate.normalized_name,
    candidate.source_priority,
    candidate.name collate "C"
) as source
on conflict (user_id, normalized_name)
do update set is_active = true, deleted_at = null;

alter table public.categories
  add column if not exists category_type text,
  add column if not exists reporting_role text,
  add column if not exists archived_at timestamptz,
  add column if not exists merged_into_category_id uuid;

update public.categories as category
set category_type = case
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', '')), '[^a-z0-9]+', '', 'g') in ('account', 'accounts') then 'account'
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', '')), '[^a-z0-9]+', '', 'g') in ('asset', 'assets') then 'asset'
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', '')), '[^a-z0-9]+', '', 'g') in ('debt', 'debts') then 'debt'
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', '')), '[^a-z0-9]+', '', 'g') in ('savingsgoal', 'savingsgoals') then 'savings_goal'
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', '')), '[^a-z0-9]+', '', 'g') in ('subscription', 'subscriptions') then 'subscription'
  when regexp_replace(lower(coalesce(category.metadata ->> 'category_type', category.type, '')), '[^a-z0-9]+', '', 'g') = 'income' then 'income'
  else 'expense'
end
where category.category_type is null
   or btrim(category.category_type) = '';

update public.categories
set reporting_role = case
      when lower(btrim(coalesce(metadata ->> 'reporting_role', ''))) = 'salary' then 'salary'
      else null
    end,
    archived_at = case when is_active then null else coalesce(archived_at, updated_at, now()) end
where reporting_role is null
   or is_active = false;

update public.categories
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
  'category_type', case category_type
    when 'account' then 'Account'
    when 'asset' then 'Asset'
    when 'debt' then 'Debt'
    when 'income' then 'Income'
    when 'savings_goal' then 'Savings Goal'
    when 'subscription' then 'Subscription'
    else 'Expense'
  end,
  'reporting_role', reporting_role
));

-- Exact legacy Salary categories get a stable reporting role. Other income
-- names remain unclassified so salary reporting never relies on fuzzy names.
update public.categories
set reporting_role = 'salary',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'reporting_role', 'salary',
      'reporting_role_source', 'exact_legacy_name_backfill'
    )
where category_type = 'income'
  and reporting_role is null
  and lower(btrim(name)) = 'salary';

alter table public.categories
  alter column category_type set default 'expense',
  alter column category_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_category_type_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_category_type_check
      check (category_type in ('account', 'asset', 'debt', 'expense', 'income', 'savings_goal', 'subscription'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_merged_into_category_id_fkey'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_merged_into_category_id_fkey
      foreign key (merged_into_category_id) references public.categories(id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'categories_not_merged_into_self_check'
      and conrelid = 'public.categories'::regclass
  ) then
    alter table public.categories
      add constraint categories_not_merged_into_self_check
      check (merged_into_category_id is null or merged_into_category_id <> id);
  end if;
end $$;

-- @allow-destructive-migration: The legacy index collapses all page category
-- types to "expense" and incorrectly prevents distinct normalized types from
-- sharing a name. The replacement is equivalent for transaction categories
-- and safely excludes merged audit records.
drop index if exists public.categories_user_name_type_active_idx;

create unique index if not exists categories_user_name_category_type_active_idx
  on public.categories (user_id, lower(btrim(name)), category_type)
  where deleted_at is null and merged_into_category_id is null;

create index if not exists categories_user_lifecycle_idx
  on public.categories (user_id, category_type, is_active, reporting_role)
  where deleted_at is null;

create index if not exists categories_merged_into_category_id_idx
  on public.categories (merged_into_category_id)
  where merged_into_category_id is not null;

create or replace function public.merge_categories(
  p_source_category_id uuid,
  p_target_category_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.categories%rowtype;
  v_target public.categories%rowtype;
  v_user_id uuid := (select auth.uid());
  v_merged_at timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'You must be signed in to merge categories.';
  end if;
  if p_source_category_id is null or p_target_category_id is null or p_source_category_id = p_target_category_id then
    raise exception 'Choose two different categories to merge.';
  end if;

  -- Lock in a deterministic order so simultaneous cleanup requests cannot
  -- partially reassign data or deadlock one another.
  perform category.id
  from public.categories as category
  where category.id in (p_source_category_id, p_target_category_id)
  order by category.id
  for update;

  select * into v_source
  from public.categories
  where id = p_source_category_id
    and user_id = v_user_id
    and deleted_at is null;

  select * into v_target
  from public.categories
  where id = p_target_category_id
    and user_id = v_user_id
    and deleted_at is null;

  if v_source.id is null or v_target.id is null then
    raise exception 'Category not found.';
  end if;
  if v_source.merged_into_category_id is not null then
    raise exception 'The source category has already been merged.';
  end if;
  if v_target.merged_into_category_id is not null or not v_target.is_active then
    raise exception 'Choose an active, unmerged target category.';
  end if;
  if v_source.category_type <> v_target.category_type then
    raise exception 'Categories can only be merged within the same type.';
  end if;
  if v_source.reporting_role is not null
     and v_target.reporting_role is not null
     and v_source.reporting_role <> v_target.reporting_role then
    raise exception 'The categories have conflicting reporting roles.';
  end if;

  update public.categories
  set reporting_role = coalesce(v_target.reporting_role, v_source.reporting_role),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'category_type', category_type,
        'reporting_role', coalesce(v_target.reporting_role, v_source.reporting_role)
      ))
  where id = v_target.id
    and user_id = v_user_id;

  update public.transactions
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where v_user_id = user_id and category_id = v_source.id;

  update public.budget_items
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.assets
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.debts
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.savings_goals
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.subscriptions
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.scenario_items
  set category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category_name', v_target.name
      )
  where user_id = v_user_id and category_id = v_source.id;

  update public.accounts
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_id', v_target.id,
        'category', v_target.name,
        'category_name', v_target.name
      )
  where user_id = v_user_id
    and deleted_at is null
    and metadata ->> 'category_id' = v_source.id::text;

  update public.user_settings
  set default_income_category_id = case
        when default_income_category_id = v_source.id then v_target.id
        else default_income_category_id
      end,
      default_expense_category_id = case
        when default_expense_category_id = v_source.id then v_target.id
        else default_expense_category_id
      end
  where user_id = v_user_id
    and (default_income_category_id = v_source.id or default_expense_category_id = v_source.id);

  -- Avoid a self-parent if the target was previously nested under the source.
  update public.categories
  set parent_id = null
  where id = v_target.id and user_id = v_user_id and parent_id = v_source.id;

  update public.categories
  set parent_id = v_target.id
  where user_id = v_user_id
    and parent_id = v_source.id
    and id <> v_target.id;

  update public.categories
  set is_active = false,
      is_default = false,
      archived_at = v_merged_at,
      merged_into_category_id = v_target.id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'category_type', category_type,
        'merged_at', v_merged_at,
        'merged_into_category_id', v_target.id,
        'merged_into_category_name', v_target.name
      )
  where id = v_source.id
    and user_id = v_user_id;

  return v_target.id;
end;
$$;

revoke all on function public.merge_categories(uuid, uuid) from public;
grant execute on function public.merge_categories(uuid, uuid) to authenticated;
