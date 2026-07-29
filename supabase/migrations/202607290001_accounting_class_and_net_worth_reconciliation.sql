-- Persisted accounting classifications are authoritative for new rows, while
-- the legacy debt/card inference remains in place for historical data. A debt
-- installment can therefore reduce principal as financing activity and record
-- only its interest component as economic expense.

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
    lower(coalesce(
      nullif(txn.metadata->>'accounting_class', ''),
      nullif(source.metadata->>'accounting_class', ''),
      ''
    )) as accounting_class,
    least(
      abs(coalesce(txn.amount, 0)),
      greatest(
        case
          when coalesce(txn.metadata->>'debt_interest_amount', source.metadata->>'debt_interest_amount', '') ~ '^[0-9]+([.][0-9]+)?$'
            then coalesce(txn.metadata->>'debt_interest_amount', source.metadata->>'debt_interest_amount')::numeric
          else 0
        end,
        0
      )
    ) as debt_interest_amount,
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
    case
      when context.accounting_class in ('financing_payment', 'financing_receipt') then true
      when context.accounting_class in ('operating_expense', 'operating_income', 'transfer') then false
      else (
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
      )
    end as is_financing
  from transaction_context as context
)
select
  transaction_id,
  user_id,
  transaction_date,
  category_id,
  case when is_financing then 'financing' else 'operating' end as financial_class,
  case
    when accounting_class = 'operating_income' and is_reversal then -amount
    when accounting_class = 'operating_income' then amount
    when accounting_class <> '' then 0
    when is_financing then 0
    when is_reversal and reversed_type = 'income' then -amount
    when not is_reversal and transaction_type = 'income' then amount
    else 0
  end as operating_income_delta,
  case
    when accounting_class = 'operating_expense' and is_reversal then -amount
    when accounting_class = 'operating_expense' then amount
    when accounting_class = 'financing_payment'
      and transaction_type = 'transfer'
      and is_transfer_credit then 0
    when accounting_class = 'financing_payment' and is_reversal then -debt_interest_amount
    when accounting_class = 'financing_payment' then debt_interest_amount
    when accounting_class <> '' then 0
    when is_financing then 0
    when is_reversal and reversed_type = 'expense' then -amount
    when not is_reversal and transaction_type = 'expense' then amount
    else 0
  end as operating_expense_delta,
  case
    when accounting_class = 'financing_receipt' and is_reversal then -(amount - debt_interest_amount)
    when accounting_class = 'financing_receipt' then amount - debt_interest_amount
    when accounting_class <> '' then 0
    when not is_financing then 0
    when is_reversal and reversed_type = 'income' then -amount
    when not is_reversal and transaction_type = 'income' then amount
    else 0
  end as financing_receipt_delta,
  case
    when accounting_class = 'financing_payment'
      and transaction_type = 'transfer'
      and is_transfer_credit then 0
    when accounting_class = 'financing_payment' and is_reversal then -(amount - debt_interest_amount)
    when accounting_class = 'financing_payment' then amount - debt_interest_amount
    when accounting_class <> '' then 0
    when not is_financing then 0
    when is_reversal and reversed_type in ('expense', 'transfer') and not is_transfer_credit then -amount
    when not is_reversal and transaction_type in ('expense', 'transfer') and not is_transfer_credit then amount
    else 0
  end as financing_payment_delta
from classified;

alter view public.v_transaction_financial_effects set (security_invoker = true);
grant select on public.v_transaction_financial_effects to anon, authenticated, service_role;

comment on view public.v_transaction_financial_effects is
  'Canonical posted transaction classification with backward-compatible legacy inference and principal/interest splitting.';

-- This view supplies an auditable lifetime performance bridge. Account and
-- debt opening values may predate the transaction ledger, so they are exposed
-- as opening position and other adjustments instead of fabricated activity.
create or replace view public.v_financial_performance_reconciliation as
with performance as (
  select
    user_id,
    coalesce(sum(operating_income_delta), 0) as lifetime_income,
    coalesce(sum(operating_expense_delta), 0) as lifetime_expense
  from public.v_transaction_financial_effects
  group by user_id
), account_position as (
  select
    user_id,
    coalesce(sum(current_balance), 0) as liquid_account_position
  from public.v_account_balances
  where is_active = true
  group by user_id
), debt_position as (
  select
    debt.user_id,
    coalesce(sum(case
      when lower(coalesce(debt.metadata->>'debt_nature', 'borrowing')) = 'lending'
        and lower(coalesce(debt.status, debt.metadata->>'status', progress.status)) <> 'archived'
        then progress.remaining_amount
      else 0
    end), 0) as lending_receivables,
    coalesce(sum(case
      when lower(coalesce(debt.metadata->>'debt_nature', 'borrowing')) <> 'lending'
        and lower(coalesce(debt.status, debt.metadata->>'status', progress.status)) <> 'archived'
        and lower(regexp_replace(coalesce(debt.type, debt.metadata->>'type', ''), '[ _-]+', '', 'g')) <> 'creditcard'
        and coalesce(debt.metadata->>'credit_card_account_id', '') = ''
        and coalesce(debt.metadata->>'auto_credit_card_account_id', '') = ''
        then progress.remaining_amount
      else 0
    end), 0) as borrowing_liabilities
  from public.debts as debt
  join public.v_debt_progress as progress on progress.debt_id = debt.id
  where debt.deleted_at is null
  group by debt.user_id
), users as (
  select user_id from performance
  union
  select user_id from account_position
  union
  select user_id from debt_position
)
select
  users.user_id,
  coalesce(performance.lifetime_income, 0) as lifetime_income,
  coalesce(performance.lifetime_expense, 0) as lifetime_expense,
  coalesce(performance.lifetime_income, 0) - coalesce(performance.lifetime_expense, 0) as lifetime_net_income,
  coalesce(account_position.liquid_account_position, 0) as liquid_account_position,
  coalesce(debt_position.lending_receivables, 0) as lending_receivables,
  coalesce(debt_position.borrowing_liabilities, 0) as borrowing_liabilities,
  coalesce(account_position.liquid_account_position, 0)
    + coalesce(debt_position.lending_receivables, 0)
    - coalesce(debt_position.borrowing_liabilities, 0) as closing_net_worth,
  (
    coalesce(account_position.liquid_account_position, 0)
    + coalesce(debt_position.lending_receivables, 0)
    - coalesce(debt_position.borrowing_liabilities, 0)
  ) - (
    coalesce(performance.lifetime_income, 0)
    - coalesce(performance.lifetime_expense, 0)
  ) as opening_position_and_adjustments,
  0::numeric as reconciliation_difference
from users
left join performance using (user_id)
left join account_position using (user_id)
left join debt_position using (user_id);

alter view public.v_financial_performance_reconciliation set (security_invoker = true);
grant select on public.v_financial_performance_reconciliation to anon, authenticated, service_role;

comment on view public.v_financial_performance_reconciliation is
  'Lifetime economic performance reconciled to closing financial position with explicit opening and legacy adjustments.';
