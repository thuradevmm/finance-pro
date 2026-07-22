-- Add an opt-in payday-anchored salary view and user-controlled future
-- planning table settings. Existing transactions, scheduled plans, reports,
-- and calendar-month views are intentionally left unchanged.

alter table public.user_settings
  add column if not exists salary_period_enabled boolean not null default false,
  add column if not exists salary_period_start_day smallint not null default 1,
  add column if not exists salary_period_default_view boolean not null default false;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_settings_salary_period_start_day_check'
      and conrelid = 'public.user_settings'::regclass
  ) then
    alter table public.user_settings
      add constraint user_settings_salary_period_start_day_check
      check (salary_period_start_day between 1 and 31) not valid;
    alter table public.user_settings
      validate constraint user_settings_salary_period_start_day_check;
  end if;
end $$;

create table if not exists public.future_planning_settings (
  user_id uuid primary key,
  selected_years integer[] not null default '{}'::integer[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.future_planning_columns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  direction text not null default 'expense',
  category_id uuid references public.categories(id) on delete set null,
  related_entity_type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint future_planning_columns_name_check check (char_length(btrim(name)) between 1 and 80),
  constraint future_planning_columns_direction_check check (direction in ('income', 'expense', 'saving', 'neutral')),
  constraint future_planning_columns_related_type_check check (
    related_entity_type is null
    or related_entity_type in ('asset', 'budget', 'debt', 'savings_goal', 'subscription')
  ),
  constraint future_planning_columns_source_check check (
    (category_id is not null and related_entity_type is null)
    or (category_id is null and related_entity_type is not null)
  )
);

create unique index if not exists future_planning_columns_user_name_active_idx
  on public.future_planning_columns (user_id, lower(btrim(name)))
  where is_active = true;
create index if not exists future_planning_columns_user_sort_idx
  on public.future_planning_columns (user_id, sort_order, created_at);
create index if not exists future_planning_columns_category_idx
  on public.future_planning_columns (category_id)
  where category_id is not null;

drop trigger if exists set_updated_at on public.future_planning_settings;
create trigger set_updated_at
  before update on public.future_planning_settings
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.future_planning_columns;
create trigger set_updated_at
  before update on public.future_planning_columns
  for each row execute procedure public.set_updated_at();

alter table public.future_planning_settings enable row level security;
alter table public.future_planning_settings force row level security;
drop policy if exists owner_access on public.future_planning_settings;
create policy owner_access on public.future_planning_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.future_planning_columns enable row level security;
alter table public.future_planning_columns force row level security;
drop policy if exists owner_access on public.future_planning_columns;
create policy owner_access on public.future_planning_columns
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.future_planning_settings to authenticated;
grant select, insert, update, delete on public.future_planning_columns to authenticated;

-- Keep category-backed custom columns aligned with the category merge flow
-- introduced by the lifecycle migration, without rewriting any plan amounts.
create or replace function public.relink_future_planning_columns_after_category_merge()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.merged_into_category_id is not null
     and new.merged_into_category_id is distinct from old.merged_into_category_id then
    update public.future_planning_columns
    set category_id = new.merged_into_category_id
    where user_id = new.user_id
      and category_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists relink_future_planning_columns_after_category_merge on public.categories;
create trigger relink_future_planning_columns_after_category_merge
  after update of merged_into_category_id on public.categories
  for each row execute procedure public.relink_future_planning_columns_after_category_merge();
