-- FinancePro expects the existing public schema to be present before this migration.
-- All browser database access uses the authenticated role and is constrained by RLS.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.user_profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_profiles_auth_user_id_fkey'
      and conrelid = 'public.user_profiles'::regclass
  ) then
    alter table public.user_profiles
      add constraint user_profiles_auth_user_id_fkey
      foreign key (id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tables with a direct user_id ownership column.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts', 'asset_history_events', 'assets', 'budget_plans', 'debts',
    'export_jobs', 'file_links', 'financial_scenarios', 'people',
    'person_payment_records', 'savings_goals', 'subscriptions', 'transactions',
    'uploaded_files'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('drop policy if exists owner_access on public.%I', table_name);
    execute format(
      'create policy owner_access on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',
      table_name
    );
  end loop;
end $$;

alter table public.user_profiles enable row level security;
alter table public.user_profiles force row level security;
drop policy if exists owner_access on public.user_profiles;
create policy owner_access on public.user_profiles for all to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter table public.user_settings enable row level security;
alter table public.user_settings force row level security;
drop policy if exists owner_access on public.user_settings;
create policy owner_access on public.user_settings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Default categories are readable by every signed-in user but immutable to them.
alter table public.categories enable row level security;
alter table public.categories force row level security;
drop policy if exists category_read on public.categories;
drop policy if exists category_insert on public.categories;
drop policy if exists category_update on public.categories;
drop policy if exists category_delete on public.categories;
create policy category_read on public.categories for select to authenticated
  using (user_id is null or (select auth.uid()) = user_id);
create policy category_insert on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy category_update on public.categories for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy category_delete on public.categories for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Child rows derive ownership from their parent record.
alter table public.budget_items enable row level security;
alter table public.budget_items force row level security;
drop policy if exists owner_access on public.budget_items;
create policy owner_access on public.budget_items for all to authenticated
using (exists (select 1 from public.budget_plans p where p.id = budget_plan_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.budget_plans p where p.id = budget_plan_id and p.user_id = (select auth.uid())));

alter table public.debt_payments enable row level security;
alter table public.debt_payments force row level security;
drop policy if exists owner_access on public.debt_payments;
create policy owner_access on public.debt_payments for all to authenticated
using (exists (select 1 from public.debts p where p.id = debt_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.debts p where p.id = debt_id and p.user_id = (select auth.uid())));

alter table public.savings_goal_entries enable row level security;
alter table public.savings_goal_entries force row level security;
drop policy if exists owner_access on public.savings_goal_entries;
create policy owner_access on public.savings_goal_entries for all to authenticated
using (exists (select 1 from public.savings_goals p where p.id = savings_goal_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.savings_goals p where p.id = savings_goal_id and p.user_id = (select auth.uid())));

alter table public.scenario_items enable row level security;
alter table public.scenario_items force row level security;
drop policy if exists owner_access on public.scenario_items;
create policy owner_access on public.scenario_items for all to authenticated
using (exists (select 1 from public.financial_scenarios p where p.id = scenario_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.financial_scenarios p where p.id = scenario_id and p.user_id = (select auth.uid())));

alter table public.subscription_payments enable row level security;
alter table public.subscription_payments force row level security;
drop policy if exists owner_access on public.subscription_payments;
create policy owner_access on public.subscription_payments for all to authenticated
using (exists (select 1 from public.subscriptions p where p.id = subscription_id and p.user_id = (select auth.uid())))
with check (exists (select 1 from public.subscriptions p where p.id = subscription_id and p.user_id = (select auth.uid())));

-- Views run with the caller's permissions so underlying table RLS is enforced.
do $$
declare
  view_name text;
begin
  foreach view_name in array array[
    'v_account_balances', 'v_monthly_income_expense', 'v_yearly_income_expense',
    'v_budget_vs_actual', 'v_savings_goal_progress', 'v_debt_progress',
    'v_upcoming_subscriptions', 'v_people_payment_summary',
    'v_assets_with_usage', 'v_dashboard_summary'
  ] loop
    execute format('alter view public.%I set (security_invoker = true)', view_name);
  end loop;
end $$;

-- Private receipt storage: the first path segment must be the authenticated user id.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do update set public = false;

drop policy if exists receipt_read on storage.objects;
drop policy if exists receipt_insert on storage.objects;
drop policy if exists receipt_update on storage.objects;
drop policy if exists receipt_delete on storage.objects;
create policy receipt_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipt_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipt_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipt_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
