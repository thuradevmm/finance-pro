-- Align the live Supabase schema with the current application flows.
-- The original project schema existed before these app flows, so this migration
-- is intentionally idempotent and additive.

alter table if exists public.accounts
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists type text,
  add column if not exists currency_code text not null default 'MMK',
  add column if not exists initial_balance numeric not null default 0,
  add column if not exists description text,
  add column if not exists color text,
  add column if not exists icon text,
  add column if not exists is_active boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.categories
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists type text not null default 'expense',
  add column if not exists icon text,
  add column if not exists color text,
  add column if not exists is_default boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.transactions
  add column if not exists user_id uuid,
  add column if not exists transaction_date date not null default current_date,
  add column if not exists type text not null default 'expense',
  add column if not exists amount numeric not null default 0,
  add column if not exists account_id uuid,
  add column if not exists transfer_account_id uuid,
  add column if not exists category_id uuid,
  add column if not exists payment_method text,
  add column if not exists status text,
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists note text,
  add column if not exists related_entity_type text,
  add column if not exists related_entity_id uuid,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.budget_plans
  add column if not exists user_id uuid,
  add column if not exists name text,
  add column if not exists period_type text not null default 'monthly',
  add column if not exists plan_type text not null default 'budget',
  add column if not exists start_date date not null default current_date,
  add column if not exists end_date date,
  add column if not exists status text not null default 'active',
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.budget_items
  add column if not exists user_id uuid,
  add column if not exists budget_plan_id uuid,
  add column if not exists category_id uuid,
  add column if not exists planned_amount numeric not null default 0,
  add column if not exists alert_percentage numeric not null default 80,
  add column if not exists note text,
  add column if not exists type text not null default 'expense',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.budget_items as budget_item
set user_id = budget_plan.user_id,
    updated_at = now()
from public.budget_plans as budget_plan
where budget_item.budget_plan_id = budget_plan.id
  and budget_item.user_id is null
  and budget_plan.user_id is not null;

create index if not exists budget_items_user_id_idx on public.budget_items (user_id);
create index if not exists budget_items_budget_plan_id_idx on public.budget_items (budget_plan_id);

alter table if exists public.assets
  add column if not exists user_id uuid,
  add column if not exists category_id uuid,
  add column if not exists name text,
  add column if not exists purchase_amount numeric not null default 0,
  add column if not exists current_value numeric,
  add column if not exists purchase_date date,
  add column if not exists start_using_date date,
  add column if not exists condition text,
  add column if not exists status text not null default 'Active',
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.debts
  add column if not exists user_id uuid,
  add column if not exists category_id uuid,
  add column if not exists payment_account_id uuid,
  add column if not exists name text,
  add column if not exists type text,
  add column if not exists lender text,
  add column if not exists total_amount numeric not null default 0,
  add column if not exists repaid_amount numeric not null default 0,
  add column if not exists monthly_payment numeric not null default 0,
  add column if not exists interest_rate numeric not null default 0,
  add column if not exists start_date date,
  add column if not exists next_payment_date date,
  add column if not exists status text not null default 'active',
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.debts
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'category_id', category_id,
      'interest_rate', interest_rate,
      'lender', lender,
      'monthly_payment', monthly_payment,
      'next_payment_date', next_payment_date,
      'payment_account_id', payment_account_id,
      'repaid_amount', repaid_amount,
      'start_date', start_date,
      'status', status,
      'total_amount', total_amount,
      'type', type
    )),
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
   or not (metadata ? 'total_amount')
   or not (metadata ? 'interest_rate');

alter table if exists public.savings_goals
  add column if not exists user_id uuid,
  add column if not exists account_id uuid,
  add column if not exists category_id uuid,
  add column if not exists name text,
  add column if not exists target_amount numeric not null default 0,
  add column if not exists current_amount numeric not null default 0,
  add column if not exists saved_amount numeric not null default 0,
  add column if not exists monthly_contribution numeric not null default 0,
  add column if not exists target_date date,
  add column if not exists status text not null default 'active',
  add column if not exists description text,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.savings_goals
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'account_id', account_id,
      'category_id', category_id,
      'current_amount', current_amount,
      'description', description,
      'monthly_contribution', monthly_contribution,
      'saved_amount', saved_amount,
      'status', status,
      'target_amount', target_amount,
      'target_date', target_date
    )),
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
   or not (metadata ? 'target_amount')
   or not (metadata ? 'category_id');

alter table if exists public.subscriptions
  add column if not exists user_id uuid,
  add column if not exists account_id uuid,
  add column if not exists category_id uuid,
  add column if not exists name text,
  add column if not exists amount numeric not null default 0,
  add column if not exists billing_cycle text not null default 'monthly',
  add column if not exists next_billing_date date,
  add column if not exists reminder_enabled boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.subscriptions
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'account_id', account_id,
      'amount', amount,
      'billing_cycle', billing_cycle,
      'category_id', category_id,
      'next_billing_date', next_billing_date,
      'reminder_enabled', reminder_enabled,
      'status', status
    )),
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
   or not (metadata ? 'amount')
   or not (metadata ? 'category_id');

update public.assets
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'category_id', category_id,
      'condition', condition,
      'current_value', current_value,
      'note', description,
      'purchase_amount', purchase_amount,
      'purchase_date', purchase_date,
      'start_using_date', start_using_date,
      'status', status
    )),
    updated_at = now()
where coalesce(metadata, '{}'::jsonb) = '{}'::jsonb
   or not (metadata ? 'purchase_amount')
   or not (metadata ? 'category_id');

with styled_categories as (
  select
    id,
    case
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Account', 'Accounts') then 'Account'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Asset', 'Assets') then 'Asset'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Debt', 'Debts') then 'Debt'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Savings Goal', 'Savings Goals') then 'Savings Goal'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Subscription', 'Subscriptions') then 'Subscription'
      when lower(type) = 'income' or coalesce(metadata, '{}'::jsonb) ->> 'category_type' = 'Income' then 'Income'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Accounts' then 'Account'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Assets' then 'Asset'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Debts' then 'Debt'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Savings Goals' then 'Savings Goal'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Subscriptions' then 'Subscription'
      else 'Expense'
    end as category_type
  from public.categories
  where user_id is not null
)
update public.categories as categories
set color = case styled_categories.category_type
      when 'Account' then 'Blue'
      when 'Asset' then 'Gray'
      when 'Debt' then 'Amber'
      when 'Expense' then 'Red'
      when 'Income' then 'Green'
      when 'Savings Goal' then 'Indigo'
      when 'Subscription' then 'Purple'
      else 'Red'
    end,
    icon = case styled_categories.category_type
      when 'Account' then 'account'
      when 'Asset' then 'box'
      when 'Debt' then 'credit'
      when 'Expense' then 'trendingDown'
      when 'Income' then 'trendingUp'
      when 'Savings Goal' then 'target'
      when 'Subscription' then 'subscriptions'
      else 'trendingDown'
    end,
    metadata = (coalesce(categories.metadata, '{}'::jsonb) - 'monthly_average') || jsonb_build_object('category_type', styled_categories.category_type),
    updated_at = now()
from styled_categories
where categories.id = styled_categories.id;
