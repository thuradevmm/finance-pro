-- Count debts on the dashboard from the same calculated status used by the
-- Debts page. This includes linked partial repayments, reversal cancellation,
-- credit-card activity, and standalone debt-payment records.

create or replace view public.v_dashboard_summary as
with account_totals as (
  select user_id, sum(current_balance) as total_balance
  from public.v_account_balances
  where is_active = true
  group by user_id
), month_totals as (
  select user_id, total_income, total_expense
  from public.v_monthly_income_expense
  where month = date_trunc('month', current_date)::date
), transaction_counts as (
  select user_id, count(*) as transaction_count
  from public.transactions
  where deleted_at is null
    and lower(coalesce(status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
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
left join subscription_counts using (user_id);

alter view public.v_dashboard_summary set (security_invoker = true);
grant select on public.v_dashboard_summary to anon, authenticated, service_role;
