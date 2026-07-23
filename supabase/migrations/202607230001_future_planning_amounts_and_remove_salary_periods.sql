-- Remove the salary-period feature and make future planning an independent,
-- manually maintained set of monthly planned amounts. Actual transactions link
-- to a planned amount through transaction metadata so their entered amount can
-- differ from the plan while preserving the comparison.

-- @allow-destructive-migration: the requested salary-period feature and its isolated override rows are being removed.
drop table if exists public.salary_payday_overrides;

-- @allow-destructive-migration: these settings are used only by the removed salary-period feature.
alter table public.user_settings
  drop constraint if exists user_settings_salary_period_start_day_check,
  drop column if exists salary_period_enabled,
  -- @allow-destructive-migration: these settings are used only by the removed salary-period feature.
  drop column if exists salary_period_start_day,
  drop column if exists salary_period_default_view;

drop trigger if exists relink_future_planning_columns_after_category_merge on public.categories;
drop function if exists public.relink_future_planning_columns_after_category_merge();

drop index if exists public.future_planning_columns_category_idx;

-- @allow-destructive-migration: source links are intentionally removed so planning types stay fully manual.
alter table public.future_planning_columns
  drop constraint if exists future_planning_columns_source_check,
  drop constraint if exists future_planning_columns_related_type_check,
  -- @allow-destructive-migration: source links are intentionally removed so planning types stay fully manual.
  drop constraint if exists future_planning_columns_category_id_fkey,
  drop column if exists category_id,
  -- @allow-destructive-migration: source links are intentionally removed so planning types stay fully manual.
  drop column if exists related_entity_type;

-- @allow-destructive-migration: deleting a user-defined type should also delete only its dependent planned amounts.
create table if not exists public.future_planning_amounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  column_id uuid not null references public.future_planning_columns(id) on delete cascade, -- @allow-destructive-migration: dependent planned amounts have no meaning after their user-defined type is removed.
  period_month date not null,
  amount numeric(18, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint future_planning_amounts_month_start_check
    check (extract(day from period_month) = 1),
  constraint future_planning_amounts_amount_check
    check (amount >= 0),
  constraint future_planning_amounts_user_column_month_key
    unique (user_id, column_id, period_month)
);

create index if not exists future_planning_amounts_user_month_idx
  on public.future_planning_amounts (user_id, period_month);

drop trigger if exists set_updated_at on public.future_planning_amounts;
create trigger set_updated_at
  before update on public.future_planning_amounts
  for each row execute procedure public.set_updated_at();

alter table public.future_planning_amounts enable row level security;
alter table public.future_planning_amounts force row level security;
drop policy if exists owner_access on public.future_planning_amounts;
create policy owner_access on public.future_planning_amounts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.future_planning_columns column_record
      where column_record.id = column_id
        and column_record.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.future_planning_amounts to authenticated;
