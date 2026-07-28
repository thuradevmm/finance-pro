-- Add metadata semantics for lending and one-time repayments without requiring
-- a breaking debts-table change. Existing "Lending Dad/Mom" records are
-- upgraded in place and automatic card names are made idempotent.

update public.debts
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('debt_nature', 'lending'),
  updated_at = now()
where deleted_at is null
  and coalesce(metadata->>'debt_nature', '') = ''
  and name ~* '^\s*lend(ing|t)?\b';

update public.debts
set
  name = regexp_replace(name, '(\s+Credit\s+Card){2,}(\s+Debt)?$', ' Credit Card\2', 'i'),
  updated_at = now()
where deleted_at is null
  and name ~* '(\s+Credit\s+Card){2,}(\s+Debt)?$';

-- Align stored status with the authoritative calculated ledger view. The app
-- also calculates this at read time, while this backfill fixes consumers that
-- read the debts table directly.
update public.debts as debt
set
  status = 'paid',
  next_payment_date = null,
  monthly_payment = 0,
  metadata = coalesce(debt.metadata, '{}'::jsonb) || jsonb_build_object(
    'monthly_payment', 0,
    'next_payment_date', null,
    'paid_at', coalesce(nullif(debt.metadata->>'paid_at', ''), now()::text),
    'remaining_principal', 0,
    'status', 'paid'
  ),
  updated_at = now()
from public.v_debt_progress as progress
where progress.debt_id = debt.id
  and progress.remaining_amount <= 0.005
  and lower(coalesce(debt.status, debt.metadata->>'status', 'active')) <> 'paid';

-- Dashboard cards intentionally describe posted cash movement. Credit-card
-- purchases remain economic expenses in reporting views, while an Expense
-- transaction used to settle the card is also visible as a cash expense here.
create or replace view public.v_dashboard_summary as
with account_totals as (
  select user_id, sum(current_balance) as total_balance
  from public.v_account_balances
  where is_active = true
  group by user_id
), economic_month_totals as (
  select user_id, total_income
  from public.v_monthly_income_expense
  where month = date_trunc('month', current_date)::date
), dashboard_expense_totals as (
  select
    txn.user_id,
    coalesce(sum(
      case
        when nullif(txn.metadata->>'reversed_transaction_id', '') is not null
          and lower(coalesce(nullif(txn.metadata->>'reversed_transaction_type', ''), source.type, '')) = 'expense'
          then -abs(coalesce(txn.amount, 0))
        when nullif(txn.metadata->>'reversed_transaction_id', '') is null
          and lower(txn.type) = 'expense'
          then abs(coalesce(txn.amount, 0))
        else 0
      end
    ), 0) as total_expense
  from public.transactions as txn
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.deleted_at is null
    and public.transaction_status_is_finalized(txn.status)
    and txn.transaction_date >= date_trunc('month', current_date)::date
    and txn.transaction_date < (date_trunc('month', current_date) + interval '1 month')::date
  group by txn.user_id
), transaction_counts as (
  select user_id, count(*) as transaction_count
  from public.transactions
  where deleted_at is null
    and public.transaction_status_is_finalized(status)
  group by user_id
), debt_counts as (
  select user_id, count(*) as active_debt_count
  from public.v_debt_progress
  where lower(status) <> 'paid'
  group by user_id
), savings_counts as (
  select user_id, count(*) as active_savings_goal_count
  from public.v_savings_goal_progress
  where lower(status) <> 'completed'
  group by user_id
), subscription_counts as (
  select user_id, count(*) as active_subscription_count
  from public.subscriptions
  where deleted_at is null and lower(coalesce(status, 'active')) in ('active', 'expiring')
  group by user_id
), users as (
  select user_id from public.accounts where deleted_at is null
  union
  select user_id from public.transactions where deleted_at is null
  union
  select user_id from public.debts where deleted_at is null
  union
  select user_id from public.savings_goals where deleted_at is null
  union
  select user_id from public.subscriptions where deleted_at is null
)
select
  users.user_id,
  coalesce(account_totals.total_balance, 0) as total_balance,
  coalesce(economic_month_totals.total_income, 0) as current_month_income,
  coalesce(dashboard_expense_totals.total_expense, 0) as current_month_expense,
  coalesce(transaction_counts.transaction_count, 0) as transaction_count,
  coalesce(debt_counts.active_debt_count, 0) as active_debt_count,
  coalesce(savings_counts.active_savings_goal_count, 0) as active_savings_goal_count,
  coalesce(subscription_counts.active_subscription_count, 0) as active_subscription_count
from users
left join account_totals using (user_id)
left join economic_month_totals using (user_id)
left join dashboard_expense_totals using (user_id)
left join transaction_counts using (user_id)
left join debt_counts using (user_id)
left join savings_counts using (user_id)
left join subscription_counts using (user_id);

alter view public.v_dashboard_summary set (security_invoker = true);
grant select on public.v_dashboard_summary to anon, authenticated, service_role;
