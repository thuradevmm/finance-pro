-- Baseline public schema for FinancePro.
--
-- Earlier project work created the cloud schema before migrations were
-- introduced. This migration makes a fresh local Supabase database buildable
-- from Git while remaining safe for an existing linked project.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_profiles (
  id uuid primary key,
  email text not null,
  full_name text,
  avatar_url text,
  default_currency_code text not null default 'MMK',
  date_format text not null default 'DD-MMM-YYYY',
  timezone text not null default 'Asia/Yangon',
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  type text not null default 'cash',
  currency_code text not null default 'MMK',
  initial_balance numeric not null default 0,
  description text,
  color text,
  icon text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  parent_id uuid references public.categories(id) on delete set null,
  name text not null,
  type text not null default 'expense',
  icon text,
  color text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transaction_date date not null default current_date,
  type text not null default 'expense',
  amount numeric not null default 0,
  account_id uuid references public.accounts(id),
  transfer_account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  payment_method text,
  status text not null default 'cleared',
  title text,
  description text,
  note text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  period_type text not null default 'monthly',
  plan_type text not null default 'budget',
  start_date date not null default current_date,
  end_date date,
  status text not null default 'active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budget_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  budget_plan_id uuid not null references public.budget_plans(id),
  category_id uuid references public.categories(id),
  planned_amount numeric not null default 0,
  alert_percentage numeric default 80,
  note text,
  type text not null default 'expense',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  transaction_id uuid references public.transactions(id),
  name text not null,
  asset_category text,
  purchase_amount numeric not null default 0,
  current_value numeric,
  purchase_date date,
  start_using_date date,
  condition text,
  status text not null default 'Active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  payment_account_id uuid references public.accounts(id),
  name text not null,
  type text,
  lender text,
  lender_name text,
  total_amount numeric not null default 0,
  initial_paid_amount numeric not null default 0,
  repaid_amount numeric not null default 0,
  repayment_amount numeric,
  repayment_cycle text,
  monthly_payment numeric not null default 0,
  interest_rate numeric not null default 0,
  start_date date,
  due_date date,
  next_payment_date date,
  status text not null default 'active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  debt_id uuid not null references public.debts(id),
  transaction_id uuid references public.transactions(id),
  amount numeric not null default 0,
  payment_date date not null default current_date,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  name text not null,
  target_amount numeric not null default 0,
  initial_saved_amount numeric not null default 0,
  current_amount numeric not null default 0,
  saved_amount numeric not null default 0,
  monthly_contribution numeric not null default 0,
  target_date date,
  status text not null default 'active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_goal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  savings_goal_id uuid not null references public.savings_goals(id),
  transaction_id uuid references public.transactions(id),
  amount numeric not null default 0,
  type text not null default 'deposit',
  entry_date date not null default current_date,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  name text not null,
  amount numeric not null default 0,
  billing_cycle text not null default 'monthly',
  start_date date,
  end_date date,
  next_billing_date date,
  auto_create_transaction boolean not null default false,
  reminder_enabled boolean not null default false,
  reminder_days_before integer not null default 3,
  last_reminded_at timestamptz,
  status text not null default 'active',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subscription_id uuid not null references public.subscriptions(id),
  transaction_id uuid references public.transactions(id),
  amount numeric not null default 0,
  payment_date date not null default current_date,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  email text,
  phone text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.person_payment_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  person_id uuid not null references public.people(id),
  transaction_id uuid references public.transactions(id),
  type text not null,
  amount numeric not null default 0,
  record_date date not null default current_date,
  due_date date,
  status text not null default 'unpaid',
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  base_start_date date,
  base_end_date date,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.scenario_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  scenario_id uuid not null references public.financial_scenarios(id),
  account_id uuid references public.accounts(id),
  category_id uuid references public.categories(id),
  type text not null,
  amount numeric not null default 0,
  item_date date,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  original_file_name text not null,
  stored_file_name text,
  file_path text,
  file_url text not null,
  mime_type text,
  file_size_bytes bigint,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.file_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_id uuid not null references public.uploaded_files(id),
  entity_type text not null,
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  export_type text not null,
  file_format text not null,
  filter jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  file_url text,
  error_message text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_history_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  asset_id uuid not null references public.assets(id),
  transaction_id uuid references public.transactions(id),
  event_type text not null,
  event_date date not null default current_date,
  title text,
  description text,
  amount numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key,
  currency_code text not null default 'MMK',
  date_format text not null default 'DD-MMM-YYYY',
  default_account_id uuid references public.accounts(id),
  default_income_category_id uuid references public.categories(id),
  default_expense_category_id uuid references public.categories(id),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists categories_user_name_type_active_idx
  on public.categories (user_id, lower(name), type)
  where deleted_at is null;

create index if not exists accounts_user_id_idx on public.accounts (user_id);
create index if not exists accounts_user_active_idx on public.accounts (user_id, is_active) where deleted_at is null;
create index if not exists categories_user_id_idx on public.categories (user_id);
create index if not exists transactions_user_date_idx on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_account_id_idx on public.transactions (account_id);
create index if not exists transactions_transfer_account_id_idx on public.transactions (transfer_account_id);
create index if not exists transactions_category_id_idx on public.transactions (category_id);
create index if not exists budget_plans_user_id_idx on public.budget_plans (user_id);
create index if not exists budget_items_user_id_idx on public.budget_items (user_id);
create index if not exists budget_items_budget_plan_id_idx on public.budget_items (budget_plan_id);
create index if not exists assets_user_id_idx on public.assets (user_id);
create index if not exists debts_user_id_idx on public.debts (user_id);
create index if not exists savings_goals_user_id_idx on public.savings_goals (user_id);
create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists people_user_id_idx on public.people (user_id);
create index if not exists person_payment_records_person_id_idx on public.person_payment_records (person_id);
create index if not exists financial_scenarios_user_id_idx on public.financial_scenarios (user_id);
create index if not exists uploaded_files_user_id_idx on public.uploaded_files (user_id);
create index if not exists file_links_entity_idx on public.file_links (user_id, entity_type, entity_id);

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'accounts', 'asset_history_events', 'assets', 'budget_items',
    'budget_plans', 'categories', 'debt_payments', 'debts', 'export_jobs',
    'file_links', 'financial_scenarios', 'people',
    'person_payment_records', 'savings_goal_entries', 'savings_goals',
    'scenario_items', 'subscription_payments', 'subscriptions',
    'transactions', 'uploaded_files', 'user_profiles', 'user_settings'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'updated_at'
    ) then
      execute format('drop trigger if exists set_updated_at on public.%I', target_table);
      execute format(
        'create trigger set_updated_at before update on public.%I for each row execute procedure public.set_updated_at()',
        target_table
      );
    end if;
  end loop;
end $$;

create or replace function public.create_default_user_settings(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_settings (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.seed_default_categories(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  -- New FinancePro users intentionally start with no default categories.
  perform p_user_id;
end;
$$;

create or replace function public.setup_new_user_defaults(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.create_default_user_settings(p_user_id);
  perform public.seed_default_categories(p_user_id);
end;
$$;

do $$
begin
if to_regclass('public.v_account_balances') is null then
execute $view$
create view public.v_account_balances as
with posted_transactions as (
  select
    account_id,
    type,
    amount,
    metadata
  from public.transactions
  where deleted_at is null
    and account_id is not null
    and lower(coalesce(status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
),
transaction_deltas as (
  select
    account_id,
    sum(
      case
        when lower(type) = 'income' then amount
        when lower(type) = 'expense' then -amount
        when lower(type) = 'transfer' and lower(coalesce(metadata->>'transfer_direction', '')) = 'credit' then amount
        when lower(type) = 'transfer' then -amount
        else 0
      end
    ) as balance_delta
  from posted_transactions
  group by account_id
)
select
  account.id as account_id,
  account.user_id,
  account.name,
  account.type,
  account.currency_code,
  account.initial_balance,
  account.initial_balance + coalesce(transaction_delta.balance_delta, 0) as current_balance,
  account.is_active,
  account.sort_order,
  account.created_at,
  account.updated_at
from public.accounts as account
left join transaction_deltas as transaction_delta
  on transaction_delta.account_id = account.id
where account.deleted_at is null
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_monthly_income_expense') is null then
execute $view$
create view public.v_monthly_income_expense as
select
  txn.user_id,
  to_char(date_trunc('month', txn.transaction_date), 'YYYY-MM') as month,
  coalesce(sum(case when lower(txn.type) = 'income' then txn.amount else 0 end), 0) as total_income,
  coalesce(sum(case when lower(txn.type) = 'expense' then txn.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when lower(txn.type) = 'income' then txn.amount when lower(txn.type) = 'expense' then -txn.amount else 0 end), 0) as net_amount,
  count(*) filter (where lower(txn.type) in ('income', 'expense')) as transaction_count
from public.transactions as txn
where txn.deleted_at is null
  and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
group by txn.user_id, date_trunc('month', txn.transaction_date)
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_yearly_income_expense') is null then
execute $view$
create view public.v_yearly_income_expense as
select
  txn.user_id,
  to_char(date_trunc('year', txn.transaction_date), 'YYYY') as year,
  coalesce(sum(case when lower(txn.type) = 'income' then txn.amount else 0 end), 0) as total_income,
  coalesce(sum(case when lower(txn.type) = 'expense' then txn.amount else 0 end), 0) as total_expense,
  coalesce(sum(case when lower(txn.type) = 'income' then txn.amount when lower(txn.type) = 'expense' then -txn.amount else 0 end), 0) as net_amount,
  count(*) filter (where lower(txn.type) in ('income', 'expense')) as transaction_count
from public.transactions as txn
where txn.deleted_at is null
  and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
group by txn.user_id, date_trunc('year', txn.transaction_date)
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_budget_vs_actual') is null then
execute $view$
create view public.v_budget_vs_actual as
with actuals as (
  select
    txn.user_id,
    txn.category_id,
    sum(txn.amount) as actual_amount
  from public.transactions as txn
  where txn.deleted_at is null
    and lower(txn.type) = 'expense'
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
  group by txn.user_id, txn.category_id
)
select
  item.id as budget_item_id,
  plan.id as budget_plan_id,
  plan.user_id,
  plan.name as budget_name,
  plan.period_type,
  plan.plan_type,
  plan.status as budget_plan_status,
  plan.start_date,
  plan.end_date,
  item.category_id,
  category.name as category_name,
  item.type,
  item.planned_amount,
  coalesce(actual.actual_amount, 0) as actual_amount,
  item.planned_amount - coalesce(actual.actual_amount, 0) as remaining_amount,
  case
    when item.planned_amount <= 0 then 0
    else round((coalesce(actual.actual_amount, 0) / item.planned_amount) * 100, 2)
  end as usage_percentage,
  case
    when item.planned_amount <= 0 then 'No Budget'
    when coalesce(actual.actual_amount, 0) > item.planned_amount then 'Over Budget'
    when coalesce(actual.actual_amount, 0) >= item.planned_amount * 0.8 then 'Near Limit'
    else 'Under Budget'
  end as budget_status,
  item.created_at,
  item.updated_at
from public.budget_items as item
join public.budget_plans as plan
  on plan.id = item.budget_plan_id
left join public.categories as category
  on category.id = item.category_id
left join actuals as actual
  on actual.user_id = plan.user_id
 and actual.category_id = item.category_id
where plan.deleted_at is null
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_savings_goal_progress') is null then
execute $view$
create view public.v_savings_goal_progress as
with entry_totals as (
  select
    entry.savings_goal_id,
    sum(case when lower(entry.type) in ('withdrawal', 'expense') then -entry.amount else entry.amount end) as entry_amount
  from public.savings_goal_entries as entry
  group by entry.savings_goal_id
)
select
  goal.id as savings_goal_id,
  goal.user_id,
  goal.name,
  goal.target_amount,
  goal.initial_saved_amount,
  coalesce(nullif(goal.saved_amount, 0), goal.current_amount, 0) + coalesce(entry_total.entry_amount, 0) as saved_amount,
  greatest(goal.target_amount - (coalesce(nullif(goal.saved_amount, 0), goal.current_amount, 0) + coalesce(entry_total.entry_amount, 0)), 0) as remaining_amount,
  case
    when goal.target_amount <= 0 then 0
    else round(((coalesce(nullif(goal.saved_amount, 0), goal.current_amount, 0) + coalesce(entry_total.entry_amount, 0)) / goal.target_amount) * 100, 2)
  end as progress_percentage,
  goal.target_date,
  goal.status,
  goal.created_at,
  goal.updated_at
from public.savings_goals as goal
left join entry_totals as entry_total
  on entry_total.savings_goal_id = goal.id
where goal.deleted_at is null
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_debt_progress') is null then
execute $view$
create view public.v_debt_progress as
with payment_totals as (
  select
    payment.debt_id,
    sum(payment.amount) as paid_amount
  from public.debt_payments as payment
  group by payment.debt_id
)
select
  debt.id as debt_id,
  debt.user_id,
  debt.name,
  coalesce(debt.lender_name, debt.lender) as lender_name,
  debt.total_amount,
  debt.initial_paid_amount,
  coalesce(debt.repaid_amount, 0) + coalesce(payment_total.paid_amount, 0) as paid_amount,
  greatest(debt.total_amount - coalesce(debt.repaid_amount, 0) - coalesce(payment_total.paid_amount, 0), 0) as remaining_amount,
  case
    when debt.total_amount <= 0 then 0
    else round(((coalesce(debt.repaid_amount, 0) + coalesce(payment_total.paid_amount, 0)) / debt.total_amount) * 100, 2)
  end as progress_percentage,
  debt.repayment_amount,
  debt.repayment_cycle,
  debt.start_date,
  debt.due_date,
  debt.status,
  debt.created_at,
  debt.updated_at
from public.debts as debt
left join payment_totals as payment_total
  on payment_total.debt_id = debt.id
where debt.deleted_at is null
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_upcoming_subscriptions') is null then
execute $view$
create view public.v_upcoming_subscriptions as
select
  subscription.id as subscription_id,
  subscription.user_id,
  subscription.name,
  subscription.amount,
  subscription.billing_cycle,
  subscription.next_billing_date,
  subscription.status,
  account.name as account_name,
  category.name as category_name,
  subscription.created_at,
  subscription.updated_at
from public.subscriptions as subscription
left join public.accounts as account
  on account.id = subscription.account_id
left join public.categories as category
  on category.id = subscription.category_id
where subscription.deleted_at is null
  and lower(subscription.status) in ('active', 'expiring')
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_people_payment_summary') is null then
execute $view$
create view public.v_people_payment_summary as
select
  person.id as person_id,
  person.user_id,
  person.name,
  coalesce(sum(payment_record.amount) filter (where lower(payment_record.type) in ('received', 'incoming', 'borrowed_from')), 0) as total_incoming,
  coalesce(sum(payment_record.amount) filter (where lower(payment_record.type) in ('paid', 'outgoing', 'lent_to')), 0) as total_outgoing,
  coalesce(sum(payment_record.amount) filter (where lower(payment_record.type) in ('borrowed', 'borrowed_from') and lower(payment_record.status) <> 'paid'), 0) as unpaid_borrowed_amount,
  coalesce(sum(payment_record.amount) filter (where lower(payment_record.type) in ('lent', 'lent_to') and lower(payment_record.status) <> 'paid'), 0) as unpaid_lent_amount,
  person.created_at,
  person.updated_at
from public.people as person
left join public.person_payment_records as payment_record
  on payment_record.person_id = person.id
 and payment_record.deleted_at is null
where person.deleted_at is null
group by person.id, person.user_id, person.name, person.created_at, person.updated_at
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_assets_with_usage') is null then
execute $view$
create view public.v_assets_with_usage as
select
  asset.id as asset_id,
  asset.user_id,
  asset.name,
  asset.asset_category,
  asset.purchase_amount,
  asset.purchase_date,
  greatest(current_date - coalesce(asset.start_using_date, asset.purchase_date, current_date), 0) as used_days,
  asset.status,
  asset.description,
  asset.created_at,
  asset.updated_at
from public.assets as asset
where asset.deleted_at is null
$view$;
end if;
end $$;

do $$
begin
if to_regclass('public.v_dashboard_summary') is null then
execute $view$
create view public.v_dashboard_summary as
with account_totals as (
  select user_id, sum(current_balance) as total_balance
  from public.v_account_balances
  group by user_id
),
month_totals as (
  select user_id, total_income, total_expense
  from public.v_monthly_income_expense
  where month = to_char(date_trunc('month', current_date), 'YYYY-MM')
),
transaction_counts as (
  select user_id, count(*) as transaction_count
  from public.transactions
  where deleted_at is null
  group by user_id
),
debt_counts as (
  select user_id, count(*) as active_debt_count
  from public.debts
  where deleted_at is null and lower(status) = 'active'
  group by user_id
),
savings_counts as (
  select user_id, count(*) as active_savings_goal_count
  from public.savings_goals
  where deleted_at is null and lower(status) = 'active'
  group by user_id
),
subscription_counts as (
  select user_id, count(*) as active_subscription_count
  from public.subscriptions
  where deleted_at is null and lower(status) = 'active'
  group by user_id
),
users as (
  select user_id from public.accounts
  union
  select user_id from public.transactions
  union
  select user_id from public.debts
  union
  select user_id from public.savings_goals
  union
  select user_id from public.subscriptions
)
select
  users.user_id,
  coalesce(account_totals.total_balance, 0) as total_balance,
  coalesce(month_totals.total_income, 0) as current_month_income,
  coalesce(month_totals.total_expense, 0) as current_month_expense,
  coalesce(transaction_counts.transaction_count, 0) as transaction_count,
  coalesce(debt_counts.active_debt_count, 0) as active_debt_count,
  coalesce(savings_counts.active_savings_goal_count, 0) as active_savings_goal_count,
  coalesce(subscription_counts.active_subscription_count, 0) as active_subscription_count
from users
left join account_totals using (user_id)
left join month_totals using (user_id)
left join transaction_counts using (user_id)
left join debt_counts using (user_id)
left join savings_counts using (user_id)
left join subscription_counts using (user_id)
$view$;
end if;
end $$;
