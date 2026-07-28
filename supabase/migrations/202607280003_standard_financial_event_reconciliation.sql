-- One authoritative database classification for operating performance and
-- financing activity. Principal repayments, card settlements, borrowing
-- proceeds, and returned lending principal affect cash and balance-sheet
-- accounts without becoming a second expense or new operating income.

create or replace view public.v_transaction_financial_effects as
with transaction_context as (
  select
    txn.id as transaction_id,
    txn.user_id,
    txn.transaction_date,
    txn.category_id,
    lower(txn.type) as transaction_type,
    abs(coalesce(txn.amount, 0)) as amount,
    txn.metadata,
    source.metadata as source_metadata,
    nullif(txn.metadata->>'reversed_transaction_id', '') is not null as is_reversal,
    lower(coalesce(
      nullif(txn.metadata->>'reversed_transaction_type', ''),
      source.type,
      case lower(txn.type)
        when 'income' then 'expense'
        when 'expense' then 'income'
        when 'transfer' then 'transfer'
        else ''
      end
    )) as reversed_type,
    lower(coalesce(
      nullif(txn.metadata->>'transfer_direction', ''),
      nullif(txn.metadata->>'same_account_transfer_role', ''),
      ''
    )) in ('credit', 'in') as is_transfer_credit,
    lower(coalesce(
      nullif(txn.related_entity_type, ''),
      nullif(source.related_entity_type, ''),
      ''
    )) as related_entity_type,
    coalesce(txn.related_entity_id, source.related_entity_id) as related_entity_id,
    (
      lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(txn.metadata->>'financial_event', '')) = 'credit_card_payment'
      or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'financial_event', '')) = 'credit_card_payment'
    ) as is_card_payment_flow
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
), classified as (
  select
    context.*,
    (
      context.is_card_payment_flow
      or (
        context.related_entity_type = 'debt'
        and context.related_entity_id is not null
        and (
          (
            coalesce(
              nullif(context.metadata->>'credit_card_debt_id', ''),
              nullif(context.source_metadata->>'credit_card_debt_id', ''),
              ''
            ) <> ''
            and coalesce(
              nullif(context.metadata->>'credit_card_debt_id', ''),
              nullif(context.source_metadata->>'credit_card_debt_id', ''),
              ''
            ) <> context.related_entity_id::text
          )
          or not (
            lower(coalesce(context.metadata->>'credit_card_debt_impact', '')) = 'charge'
            or (
              context.is_reversal
              and context.reversed_type = 'expense'
              and lower(coalesce(context.metadata->>'financial_event', '')) = 'credit_card_activity_reversal'
              and lower(coalesce(context.metadata->>'reversed_credit_card_payment', 'false')) <> 'true'
            )
          )
        )
      )
    ) as is_financing
  from transaction_context as context
)
select
  transaction_id,
  user_id,
  transaction_date,
  category_id,
  case when is_financing then 'financing' else 'operating' end as financial_class,
  case
    when is_financing then 0
    when is_reversal and reversed_type = 'income' then -amount
    when not is_reversal and transaction_type = 'income' then amount
    else 0
  end as operating_income_delta,
  case
    when is_financing then 0
    when is_reversal and reversed_type = 'expense' then -amount
    when not is_reversal and transaction_type = 'expense' then amount
    else 0
  end as operating_expense_delta,
  case
    when not is_financing then 0
    when is_reversal and reversed_type = 'income' then -amount
    when not is_reversal and transaction_type = 'income' then amount
    else 0
  end as financing_receipt_delta,
  case
    when not is_financing then 0
    when is_reversal and reversed_type in ('expense', 'transfer') and not is_transfer_credit then -amount
    when not is_reversal and transaction_type in ('expense', 'transfer') and not is_transfer_credit then amount
    else 0
  end as financing_payment_delta
from classified;

alter view public.v_transaction_financial_effects set (security_invoker = true);
grant select on public.v_transaction_financial_effects to anon, authenticated, service_role;

comment on view public.v_transaction_financial_effects is
  'Canonical posted transaction classification. Operating net equals operating income minus operating expense; principal and card settlements are financing activity.';

create or replace view public.v_monthly_income_expense as
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  coalesce(sum(operating_income_delta), 0) as total_income,
  coalesce(sum(operating_expense_delta), 0) as total_expense,
  coalesce(sum(operating_income_delta - operating_expense_delta), 0) as net_amount,
  count(*) filter (
    where operating_income_delta <> 0 or operating_expense_delta <> 0
  ) as transaction_count
from public.v_transaction_financial_effects
group by user_id, date_trunc('month', transaction_date);

alter view public.v_monthly_income_expense set (security_invoker = true);
grant select on public.v_monthly_income_expense to anon, authenticated, service_role;

create or replace view public.v_yearly_income_expense as
select
  user_id,
  date_trunc('year', month)::date as year,
  sum(total_income) as total_income,
  sum(total_expense) as total_expense,
  sum(net_amount) as net_amount,
  sum(transaction_count)::bigint as transaction_count
from public.v_monthly_income_expense
group by user_id, date_trunc('year', month)::date;

alter view public.v_yearly_income_expense set (security_invoker = true);
grant select on public.v_yearly_income_expense to anon, authenticated, service_role;

create or replace view public.v_budget_vs_actual as
with plan_ranges as (
  select
    plan.*,
    coalesce(
      plan.end_date,
      case lower(plan.period_type)
        when 'yearly' then (date_trunc('year', plan.start_date) + interval '1 year - 1 day')::date
        else (date_trunc('month', plan.start_date) + interval '1 month - 1 day')::date
      end
    ) as effective_end_date
  from public.budget_plans as plan
  where plan.deleted_at is null
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
  plan.effective_end_date as end_date,
  item.category_id,
  category.name as category_name,
  item.type,
  item.planned_amount,
  greatest(coalesce(actual.actual_amount, 0), 0) as actual_amount,
  item.planned_amount - greatest(coalesce(actual.actual_amount, 0), 0) as remaining_amount,
  case
    when item.planned_amount <= 0 then 0
    else round((greatest(coalesce(actual.actual_amount, 0), 0) / item.planned_amount) * 100, 2)
  end as usage_percentage,
  case
    when item.planned_amount <= 0 then 'No Budget'
    when greatest(coalesce(actual.actual_amount, 0), 0) > item.planned_amount then 'Over Budget'
    when greatest(coalesce(actual.actual_amount, 0), 0) >= item.planned_amount * (coalesce(item.alert_percentage, 80) / 100) then 'Near Limit'
    else 'Under Budget'
  end as budget_status,
  item.created_at,
  item.updated_at
from public.budget_items as item
join plan_ranges as plan on plan.id = item.budget_plan_id
left join public.categories as category on category.id = item.category_id
left join lateral (
  select sum(effect.operating_expense_delta) as actual_amount
  from public.v_transaction_financial_effects as effect
  where effect.user_id = plan.user_id
    and effect.category_id = item.category_id
    and effect.transaction_date >= plan.start_date
    and effect.transaction_date <= plan.effective_end_date
) as actual on true;

alter view public.v_budget_vs_actual set (security_invoker = true);
grant select on public.v_budget_vs_actual to anon, authenticated, service_role;

create or replace view public.v_monthly_financing_activity as
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  coalesce(sum(financing_receipt_delta), 0) as total_receipts,
  coalesce(sum(financing_payment_delta), 0) as total_payments,
  coalesce(sum(financing_receipt_delta - financing_payment_delta), 0) as net_cashflow,
  count(*) filter (
    where financing_receipt_delta <> 0 or financing_payment_delta <> 0
  ) as transaction_count
from public.v_transaction_financial_effects
group by user_id, date_trunc('month', transaction_date);

alter view public.v_monthly_financing_activity set (security_invoker = true);
grant select on public.v_monthly_financing_activity to anon, authenticated, service_role;

create or replace view public.v_yearly_financing_activity as
select
  user_id,
  date_trunc('year', month)::date as year,
  sum(total_receipts) as total_receipts,
  sum(total_payments) as total_payments,
  sum(net_cashflow) as net_cashflow,
  sum(transaction_count)::bigint as transaction_count
from public.v_monthly_financing_activity
group by user_id, date_trunc('year', month)::date;

alter view public.v_yearly_financing_activity set (security_invoker = true);
grant select on public.v_yearly_financing_activity to anon, authenticated, service_role;

-- The dashboard uses the same operating totals as Transactions and Reports.
-- Financing movements remain available from the dedicated financing views.
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
  where deleted_at is null
    and lower(coalesce(status, 'active')) in ('active', 'expiring')
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
