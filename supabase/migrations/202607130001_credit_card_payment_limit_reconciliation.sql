-- Reconcile credit-card payments with card utilization and available credit.
--
-- Standard accounting treatment:
-- - A card purchase is an expense and increases the card liability.
-- - Paying the card reduces cash and the card liability; it is not a second expense.
-- - The configured credit limit is a fixed ceiling. Payments restore available
--   credit up to that ceiling but never modify or increase the limit itself.
--
-- Existing linked Expense transactions from bank/wallet accounts are backfilled
-- so historical debt payments immediately restore the respective card's credit.

create temp table tmp_credit_card_debt_accounts on commit drop as
select
  debt.id as debt_id,
  debt.user_id,
  coalesce(
    case
      when coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id')::uuid
      else null
    end,
    case
      when coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id')::uuid
      else null
    end,
    case
      when regexp_replace(lower(coalesce(payment_account.type, '')), '[\s_-]+', '', 'g') = 'creditcard'
        then payment_account.id
      else null
    end
  ) as credit_card_account_id
from public.debts as debt
left join public.accounts as payment_account
  on payment_account.id = debt.payment_account_id
 and payment_account.user_id = debt.user_id
 and payment_account.deleted_at is null
where debt.deleted_at is null
  and (
    coalesce(debt.metadata, '{}'::jsonb) ? 'credit_card_account_id'
    or coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
    or regexp_replace(lower(coalesce(debt.type, coalesce(debt.metadata, '{}'::jsonb)->>'type', '')), '[\s_-]+', '', 'g') = 'creditcard'
    or regexp_replace(lower(coalesce(payment_account.type, '')), '[\s_-]+', '', 'g') = 'creditcard'
  );

create unique index on tmp_credit_card_debt_accounts (debt_id);

create temp table tmp_credit_card_transaction_impacts on commit drop as
with linked_transactions as (
  select
    txn.id as transaction_id,
    txn.user_id,
    mapping.debt_id,
    mapping.credit_card_account_id,
    lower(coalesce(txn.type, '')) as transaction_type,
    lower(coalesce(
      nullif(coalesce(txn.metadata, '{}'::jsonb)->>'transfer_direction', ''),
      case lower(coalesce(txn.metadata, '{}'::jsonb)->>'same_account_transfer_role')
        when 'out' then 'debit'
        when 'in' then 'credit'
        else ''
      end
    )) as transfer_direction,
    txn.account_id,
    txn.transfer_account_id,
    txn.amount,
    txn.status,
    coalesce(txn.metadata, '{}'::jsonb) as metadata,
    source.type as reversed_source_type
  from public.transactions as txn
  join tmp_credit_card_debt_accounts as mapping
    on mapping.user_id = txn.user_id
   and mapping.credit_card_account_id is not null
   and (
     (txn.related_entity_type = 'debt' and txn.related_entity_id = mapping.debt_id)
     or coalesce(txn.metadata, '{}'::jsonb)->>'credit_card_debt_id' = mapping.debt_id::text
   )
  left join public.transactions as source
    on source.id = case
      when coalesce(txn.metadata, '{}'::jsonb)->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (coalesce(txn.metadata, '{}'::jsonb)->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.deleted_at is null
), classified as (
  select
    linked.*,
    case
      when lower(coalesce(linked.metadata->>'credit_card_debt_impact', '')) in ('charge', 'repayment')
        then lower(linked.metadata->>'credit_card_debt_impact')
      when linked.transaction_type = 'expense' and linked.account_id = linked.credit_card_account_id
        then 'charge'
      when linked.transaction_type = 'income' and linked.account_id = linked.credit_card_account_id
        then 'repayment'
      when linked.transaction_type = 'transfer' and linked.transfer_direction = 'debit' and linked.account_id = linked.credit_card_account_id
        then 'charge'
      when linked.transaction_type = 'transfer' and linked.transfer_direction = 'credit' and linked.account_id = linked.credit_card_account_id
        then 'repayment'
      when linked.transaction_type = 'transfer' and linked.transfer_direction = '' and linked.account_id = linked.credit_card_account_id
        then 'charge'
      when linked.transaction_type = 'transfer' and linked.transfer_direction = '' and linked.transfer_account_id = linked.credit_card_account_id
        then 'repayment'
      when linked.account_id <> linked.credit_card_account_id
       and coalesce(linked.transfer_account_id <> linked.credit_card_account_id, true)
       and linked.transaction_type = 'expense'
        then 'repayment'
      when linked.account_id <> linked.credit_card_account_id
       and coalesce(linked.transfer_account_id <> linked.credit_card_account_id, true)
       and linked.transaction_type = 'transfer'
       and linked.transfer_direction <> 'credit'
        then 'repayment'
      when linked.account_id <> linked.credit_card_account_id
       and coalesce(linked.transfer_account_id <> linked.credit_card_account_id, true)
       and linked.transaction_type = 'income'
       and lower(coalesce(linked.reversed_source_type, '')) = 'expense'
        then 'charge'
      else ''
    end as impact
  from linked_transactions as linked
)
select
  classified.*,
  classified.impact = 'repayment'
    and (
      classified.transaction_type = 'income'
      or (
        classified.account_id <> classified.credit_card_account_id
        and coalesce(classified.transfer_account_id <> classified.credit_card_account_id, true)
      )
    ) as is_credit_card_payment,
  classified.impact = 'charge'
    and classified.transaction_type = 'income'
    and classified.reversed_source_type is not null as is_payment_reversal
from classified
where classified.impact in ('charge', 'repayment');

create unique index on tmp_credit_card_transaction_impacts (transaction_id);

update public.transactions as txn
set metadata = jsonb_strip_nulls(
      coalesce(txn.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'credit_card_account_id', impact.credit_card_account_id,
        'credit_card_debt_id', impact.debt_id,
        'credit_card_debt_impact', impact.impact,
        'credit_card_payment', impact.is_credit_card_payment,
        'financial_event', case
          when impact.is_payment_reversal then 'credit_card_payment_reversal'
          when impact.is_credit_card_payment then 'credit_card_payment'
          when impact.impact = 'charge' then 'credit_card_charge'
          else 'credit_card_credit'
        end,
        'reversed_credit_card_payment', case when impact.is_payment_reversal then true else null end,
        'reversed_transaction_type', case
          when impact.reversed_source_type is not null then lower(impact.reversed_source_type)
          else null
        end
      )
    ),
    updated_at = now()
from tmp_credit_card_transaction_impacts as impact
where txn.id = impact.transaction_id;

with posted_impacts as (
  select
    impact.debt_id,
    coalesce(sum(abs(impact.amount)) filter (where impact.impact = 'charge'), 0) as charged_amount,
    coalesce(sum(abs(impact.amount)) filter (where impact.impact = 'repayment'), 0) as repaid_amount
  from tmp_credit_card_transaction_impacts as impact
  where lower(coalesce(impact.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
  group by impact.debt_id
), balances as (
  select
    debt.id as debt_id,
    greatest(
      coalesce(debt.total_amount, 0)
      + coalesce(posted.charged_amount, 0)
      - coalesce(debt.repaid_amount, 0)
      - coalesce(posted.repaid_amount, 0),
      0
    ) as remaining_amount
  from public.debts as debt
  join tmp_credit_card_debt_accounts as mapping on mapping.debt_id = debt.id
  left join posted_impacts as posted on posted.debt_id = debt.id
  where debt.deleted_at is null
)
update public.debts as debt
set monthly_payment = case when balance.remaining_amount <= 0.005 then 0 else balance.remaining_amount end,
    status = case when balance.remaining_amount <= 0.005 then 'paid' else 'active' end,
    metadata = jsonb_strip_nulls(
      (coalesce(debt.metadata, '{}'::jsonb) - 'paid_at')
      || jsonb_build_object(
        'last_debt_reconciled_at', now(),
        'monthly_payment', case when balance.remaining_amount <= 0.005 then 0 else balance.remaining_amount end,
        'status', case when balance.remaining_amount <= 0.005 then 'paid' else 'active' end,
        'paid_at', case when balance.remaining_amount <= 0.005 then now() else null end
      )
    ),
    updated_at = now()
from balances as balance
where debt.id = balance.debt_id
  and lower(coalesce(debt.status, 'active')) <> 'archived'
  and lower(coalesce(debt.metadata->>'manual_credit_card_terms', 'false')) <> 'true';

create or replace view public.v_account_balances as
with posted_transactions as (
  select account_id, transfer_account_id, type, amount, metadata
  from public.transactions
  where deleted_at is null
    and account_id is not null
    and lower(coalesce(status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
), physical_effects as (
  select
    account_id,
    case
      when lower(type) = 'income' then amount
      when lower(type) = 'expense' then -amount
      when lower(type) = 'transfer' and lower(coalesce(metadata->>'transfer_direction', '')) = 'credit' then amount
      when lower(type) = 'transfer' then -amount
      else 0
    end as balance_delta
  from posted_transactions
  union all
  select transfer_account_id, amount
  from posted_transactions
  where lower(type) = 'transfer'
    and transfer_account_id is not null
    and lower(coalesce(metadata->>'transfer_direction', '')) not in ('debit', 'credit')
), virtual_credit_card_effects as (
  select
    case
      when metadata->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (metadata->>'credit_card_account_id')::uuid
      else null
    end as account_id,
    case lower(metadata->>'credit_card_debt_impact')
      when 'repayment' then amount
      when 'charge' then -amount
      else 0
    end as balance_delta
  from posted_transactions
  where metadata->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and lower(coalesce(metadata->>'credit_card_debt_impact', '')) in ('charge', 'repayment')
    and account_id <> case
      when metadata->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (metadata->>'credit_card_account_id')::uuid
      else null
    end
    and coalesce(transfer_account_id <> case
      when metadata->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (metadata->>'credit_card_account_id')::uuid
      else null
    end, true)
), transaction_deltas as (
  select account_id, sum(balance_delta) as balance_delta
  from (
    select * from physical_effects
    union all
    select * from virtual_credit_card_effects
  ) as effects
  group by account_id
)
select
  account.id as account_id,
  account.user_id,
  account.name,
  account.type,
  account.currency_code,
  account.initial_balance,
  coalesce(transaction_delta.balance_delta, 0) as current_balance,
  account.is_active,
  account.sort_order,
  account.created_at,
  account.updated_at
from public.accounts as account
left join transaction_deltas as transaction_delta on transaction_delta.account_id = account.id
where account.deleted_at is null;

alter view public.v_account_balances set (security_invoker = true);

create or replace view public.v_monthly_income_expense as
with economic_transactions as (
  select
    txn.*,
    lower(coalesce(txn.metadata->>'reversed_transaction_type', source.type, '')) as reversed_type,
    txn.metadata->>'reversed_transaction_id' is not null as is_reversal,
    lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true' as is_card_payment_flow
  from public.transactions as txn
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.deleted_at is null
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
), effects as (
  select
    user_id,
    transaction_date,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'income' then -amount
      when not is_reversal and lower(type) = 'income' then amount
      else 0
    end as income_delta,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'expense' then -amount
      when not is_reversal and lower(type) = 'expense' then amount
      else 0
    end as expense_delta
  from economic_transactions
)
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  coalesce(sum(income_delta), 0) as total_income,
  coalesce(sum(expense_delta), 0) as total_expense,
  coalesce(sum(income_delta - expense_delta), 0) as net_amount,
  count(*) filter (where income_delta <> 0 or expense_delta <> 0) as transaction_count
from effects
group by user_id, date_trunc('month', transaction_date);

alter view public.v_monthly_income_expense set (security_invoker = true);

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

create or replace view public.v_budget_vs_actual as
select
  plan.id as budget_plan_id,
  plan.user_id,
  plan.name as budget_name,
  plan.plan_type,
  plan.period_type,
  plan.start_date,
  plan.end_date,
  plan.status as budget_plan_status,
  item.id as budget_item_id,
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
join public.budget_plans as plan on plan.id = item.budget_plan_id
left join public.categories as category on category.id = item.category_id
left join lateral (
  select sum(txn.amount) as actual_amount
  from public.transactions as txn
  where txn.user_id = plan.user_id
    and txn.category_id = item.category_id
    and txn.deleted_at is null
    and lower(txn.type) = 'expense'
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
    and txn.transaction_date >= plan.start_date
    and (plan.end_date is null or txn.transaction_date <= plan.end_date)
    and lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) <> 'true'
) as actual on true
where plan.deleted_at is null;

alter view public.v_budget_vs_actual set (security_invoker = true);
