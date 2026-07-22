-- Establish one canonical transaction-status policy without rewriting existing rows.
-- Pending transactions continue to reserve the account working balance through
-- v_account_balances, while finalized reports and linked-module progress count
-- cleared (and legacy posted/complete) transactions only.

create or replace function public.transaction_status_is_finalized(transaction_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(coalesce(nullif(btrim(transaction_status), ''), 'cleared'))
    in ('cleared', 'posted', 'complete', 'completed');
$$;

create or replace function public.transaction_status_reserves_working_balance(transaction_status text)
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $$
  select lower(coalesce(nullif(btrim(transaction_status), ''), 'cleared'))
    not in ('scheduled', 'cancelled', 'canceled', 'void', 'voided', 'failed');
$$;

comment on function public.transaction_status_is_finalized(text) is
  'True only when a transaction is finalized and may affect reports or linked-module actuals.';
comment on function public.transaction_status_reserves_working_balance(text) is
  'True when a transaction affects account working balance; includes pending reservations.';

-- Keep pending transactions in the account working balance while excluding
-- forecast-only and terminally inert rows.
create or replace view public.v_account_balances as
with posted_transactions as (
  select account_id, transfer_account_id, type, amount, metadata
  from public.transactions
  where deleted_at is null
    and account_id is not null
    and public.transaction_status_reserves_working_balance(status)
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
), debt_opening_candidates as (
  select
    debt.user_id,
    case
      when coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id', '') <> '' then
        case
          when coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id')::uuid
          else null
        end
      when coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id', '') <> '' then
        case
          when coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then (coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id')::uuid
          else null
        end
      else debt.payment_account_id
    end as account_id,
    round(coalesce(
      debt.total_amount,
      case
        when coalesce(debt.metadata, '{}'::jsonb)->>'total_amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (coalesce(debt.metadata, '{}'::jsonb)->>'total_amount')::numeric
        else 0
      end,
      0
    ) - coalesce(
      debt.repaid_amount,
      case
        when coalesce(debt.metadata, '{}'::jsonb)->>'repaid_amount' ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (coalesce(debt.metadata, '{}'::jsonb)->>'repaid_amount')::numeric
        else 0
      end,
      0
    ), 2) as opening_balance
  from public.debts as debt
  where debt.deleted_at is null
    and (
      jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb)->'credit_card_account_id') = 'string'
      or jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb)->'auto_credit_card_account_id') = 'string'
      or regexp_replace(
        lower(coalesce(debt.type, coalesce(debt.metadata, '{}'::jsonb)->>'type', '')),
        '[\s_-]+',
        '',
        'g'
      ) = 'creditcard'
    )
    and (
      lower(coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'manual_credit_card_terms', '')) = 'true'
      or lower(coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_terms', '')) = 'false'
      or (
        coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id', '') = ''
        and lower(coalesce(coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_terms', '')) <> 'true'
      )
    )
), manual_credit_card_openings as (
  select candidate.user_id, candidate.account_id, round(sum(candidate.opening_balance), 2) as opening_balance
  from debt_opening_candidates as candidate
  join public.accounts as account
    on account.id = candidate.account_id
   and account.user_id = candidate.user_id
   and account.deleted_at is null
   and regexp_replace(lower(coalesce(account.type, '')), '[\s_-]+', '', 'g') = 'creditcard'
  where candidate.account_id is not null
  group by candidate.user_id, candidate.account_id
)
select
  account.id as account_id,
  account.user_id,
  account.name,
  account.type,
  account.currency_code,
  account.initial_balance,
  coalesce(transaction_delta.balance_delta, 0) - coalesce(card_opening.opening_balance, 0) as current_balance,
  account.is_active,
  account.sort_order,
  account.created_at,
  account.updated_at
from public.accounts as account
left join transaction_deltas as transaction_delta on transaction_delta.account_id = account.id
left join manual_credit_card_openings as card_opening
  on card_opening.account_id = account.id
 and card_opening.user_id = account.user_id
where account.deleted_at is null;

alter view public.v_account_balances set (security_invoker = true);


create or replace view public.v_monthly_income_expense as
with economic_transactions as (
  select
    txn.user_id,
    txn.transaction_date,
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
    nullif(txn.metadata->>'reversed_transaction_id', '') is not null as is_reversal,
    (
      lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(txn.metadata->>'financial_event', '')) = 'credit_card_payment'
      or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'financial_event', '')) = 'credit_card_payment'
    ) as is_card_payment_flow,
    lower(txn.type) as transaction_type,
    abs(coalesce(txn.amount, 0)) as amount
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
), effects as (
  select
    user_id,
    transaction_date,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'income' then -amount
      when not is_reversal and transaction_type = 'income' then amount
      else 0
    end as income_delta,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'expense' then -amount
      when not is_reversal and transaction_type = 'expense' then amount
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
  select sum(
    case
      when lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
        or lower(coalesce(txn.metadata->>'financial_event', '')) = 'credit_card_payment'
        or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true'
        or lower(coalesce(source.metadata->>'credit_card_payment', 'false')) = 'true'
        or lower(coalesce(source.metadata->>'financial_event', '')) = 'credit_card_payment'
        then 0
      when nullif(txn.metadata->>'reversed_transaction_id', '') is not null
        and lower(coalesce(
          nullif(txn.metadata->>'reversed_transaction_type', ''),
          source.type,
          case lower(txn.type) when 'income' then 'expense' when 'expense' then 'income' else '' end
        )) = 'expense'
        then -abs(coalesce(txn.amount, 0))
      when nullif(txn.metadata->>'reversed_transaction_id', '') is null and lower(txn.type) = 'expense'
        then abs(coalesce(txn.amount, 0))
      else 0
    end
  ) as actual_amount
  from public.transactions as txn
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.user_id = plan.user_id
    and txn.category_id = item.category_id
    and txn.deleted_at is null
    and public.transaction_status_is_finalized(txn.status)
    and txn.transaction_date >= plan.start_date
    and txn.transaction_date <= plan.effective_end_date
) as actual on true;

alter view public.v_budget_vs_actual set (security_invoker = true);
grant select on public.v_budget_vs_actual to anon, authenticated, service_role;

create or replace view public.v_savings_goal_progress as
with entry_totals as (
  select
    entry.savings_goal_id,
    sum(case when lower(entry.type) in ('withdrawal', 'expense') then -abs(entry.amount) else abs(entry.amount) end) as entry_amount
  from public.savings_goal_entries as entry
  left join public.transactions as entry_transaction
    on entry_transaction.id = entry.transaction_id
   and entry_transaction.user_id = entry.user_id
  where entry.transaction_id is null
     or (
       entry_transaction.deleted_at is null
       and public.transaction_status_is_finalized(entry_transaction.status)
     )
  group by entry.savings_goal_id
), linked_transaction_totals as (
  select
    txn.related_entity_id as savings_goal_id,
    sum(
      case
        when nullif(txn.metadata->>'reversed_transaction_id', '') is not null
          and lower(coalesce(
            nullif(txn.metadata->>'reversed_transaction_type', ''),
            source.type,
            case lower(txn.type) when 'income' then 'expense' when 'expense' then 'income' when 'transfer' then 'transfer' else '' end
          )) = 'expense'
          and lower(txn.type) = 'income'
          then -abs(coalesce(txn.amount, 0))
        when lower(txn.type) = 'transfer'
          and lower(coalesce(txn.metadata->>'transfer_direction', txn.metadata->>'same_account_transfer_role', 'debit')) in ('debit', 'out')
          and txn.transfer_account_id = goal.account_id
          then abs(coalesce(txn.amount, 0))
        when lower(txn.type) = 'transfer'
          and lower(coalesce(txn.metadata->>'transfer_direction', txn.metadata->>'same_account_transfer_role', 'debit')) in ('debit', 'out')
          and txn.account_id = goal.account_id
          then -abs(coalesce(txn.amount, 0))
        when nullif(txn.metadata->>'reversed_transaction_id', '') is null and lower(txn.type) = 'expense'
          then abs(coalesce(txn.amount, 0))
        else 0
      end
    ) as transaction_amount
  from public.transactions as txn
  join public.savings_goals as goal
    on goal.id = txn.related_entity_id
   and goal.user_id = txn.user_id
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.related_entity_type = 'savings_goal'
    and txn.related_entity_id is not null
    and txn.deleted_at is null
    and public.transaction_status_is_finalized(txn.status)
    and not exists (
      select 1
      from public.savings_goal_entries as entry
      where entry.transaction_id = txn.id
    )
  group by txn.related_entity_id
), goal_amounts as (
  select
    goal.*,
    coalesce(
      goal.saved_amount,
      goal.initial_saved_amount,
      goal.current_amount,
      case when nullif(goal.metadata->>'saved_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (goal.metadata->>'saved_amount')::numeric end,
      case when nullif(goal.metadata->>'current_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (goal.metadata->>'current_amount')::numeric end,
      0
    ) as stored_saved_amount,
    coalesce(entry_total.entry_amount, 0) + coalesce(transaction_total.transaction_amount, 0) as linked_saved_amount
  from public.savings_goals as goal
  left join entry_totals as entry_total on entry_total.savings_goal_id = goal.id
  left join linked_transaction_totals as transaction_total on transaction_total.savings_goal_id = goal.id
  where goal.deleted_at is null
), progress as (
  select
    goal_amounts.*,
    greatest(stored_saved_amount + linked_saved_amount, 0) as calculated_saved_amount
  from goal_amounts
)
select
  progress.id as savings_goal_id,
  progress.user_id,
  progress.name,
  progress.target_amount,
  progress.initial_saved_amount,
  progress.calculated_saved_amount as saved_amount,
  greatest(progress.target_amount - progress.calculated_saved_amount, 0) as remaining_amount,
  case
    when progress.target_amount <= 0 then 0
    else least(round((progress.calculated_saved_amount / progress.target_amount) * 100, 2), 100)
  end as progress_percentage,
  progress.target_date,
  case
    when progress.target_amount > 0 and progress.calculated_saved_amount >= progress.target_amount then 'completed'
    when progress.target_date is not null and progress.target_date < current_date then 'behind'
    else 'active'
  end as status,
  progress.created_at,
  progress.updated_at
from progress;

alter view public.v_savings_goal_progress set (security_invoker = true);


create or replace view public.v_debt_progress as
with transaction_rows as (
  select
    txn.*,
    coalesce(
      nullif(txn.metadata->>'transfer_group_id', ''),
      nullif(txn.metadata->>'same_account_transfer_group_id', ''),
      txn.id::text
    ) as ledger_group_id,
    lower(coalesce(
      nullif(txn.metadata->>'transfer_direction', ''),
      nullif(txn.metadata->>'same_account_transfer_role', ''),
      ''
    )) as transfer_direction,
    nullif(txn.metadata->>'reversed_transaction_id', '') as reversed_transaction_id
  from public.transactions as txn
  where txn.deleted_at is null
    and public.transaction_status_is_finalized(txn.status)
), reversed_groups as (
  select distinct source.ledger_group_id
  from transaction_rows as reversal
  join transaction_rows as source
    on reversal.reversed_transaction_id = source.id::text
  where reversal.reversed_transaction_id is not null
), effective_transactions as (
  select txn.*
  from transaction_rows as txn
  where txn.reversed_transaction_id is null
    and not exists (
      select 1
      from reversed_groups as reversed
      where reversed.ledger_group_id = txn.ledger_group_id
    )
), standalone_payment_totals as (
  select
    payment.debt_id,
    sum(abs(coalesce(payment.amount, 0))) as paid_amount
  from public.debt_payments as payment
  where payment.transaction_id is null
  group by payment.debt_id
), debt_ledger as (
  select
    debt.id as debt_id,
    lower(replace(replace(replace(coalesce(debt.type, debt.metadata->>'type', ''), ' ', ''), '_', ''), '-', '')) = 'creditcard'
      or nullif(debt.metadata->>'credit_card_account_id', '') is not null
      or nullif(debt.metadata->>'auto_credit_card_account_id', '') is not null as is_credit_card,
    coalesce(
      nullif(debt.metadata->>'credit_card_account_id', ''),
      nullif(debt.metadata->>'auto_credit_card_account_id', ''),
      debt.payment_account_id::text
    ) as credit_card_account_id,
    coalesce(sum(
      case
        when (
          txn.related_entity_type = 'debt' and txn.related_entity_id = debt.id
          or txn.metadata->>'credit_card_debt_id' = debt.id::text
        )
        and (
          case
            when lower(coalesce(txn.metadata->>'credit_card_debt_impact', '')) = 'charge'
              then lower(txn.type) <> 'transfer'
                or txn.transfer_direction = ''
                or txn.account_id::text = coalesce(
                  nullif(debt.metadata->>'credit_card_account_id', ''),
                  nullif(debt.metadata->>'auto_credit_card_account_id', ''),
                  debt.payment_account_id::text
                )
            when lower(coalesce(txn.metadata->>'credit_card_debt_impact', '')) = 'repayment' then false
            when lower(txn.type) = 'expense' then txn.account_id::text = coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            )
            when lower(txn.type) = 'transfer' then txn.account_id::text = coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            ) and txn.transfer_direction in ('', 'debit', 'out')
            else false
          end
        ) then abs(coalesce(txn.amount, 0))
        else 0
      end
    ), 0) as card_charges,
    coalesce(sum(
      case
        when lower(replace(replace(replace(coalesce(debt.type, debt.metadata->>'type', ''), ' ', ''), '_', ''), '-', '')) = 'creditcard'
          or nullif(debt.metadata->>'credit_card_account_id', '') is not null
          or nullif(debt.metadata->>'auto_credit_card_account_id', '') is not null
        then case
          when not (
            txn.related_entity_type = 'debt' and txn.related_entity_id = debt.id
            or txn.metadata->>'credit_card_debt_id' = debt.id::text
          ) then 0
          when lower(coalesce(txn.metadata->>'credit_card_debt_impact', '')) = 'repayment'
            and (lower(txn.type) <> 'transfer' or txn.transfer_direction = '' or txn.account_id::text = coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            )) then abs(coalesce(txn.amount, 0))
          when lower(coalesce(txn.metadata->>'credit_card_debt_impact', '')) = 'charge' then 0
          when lower(txn.type) = 'income' and txn.account_id::text = coalesce(
            nullif(debt.metadata->>'credit_card_account_id', ''),
            nullif(debt.metadata->>'auto_credit_card_account_id', ''),
            debt.payment_account_id::text
          ) then abs(coalesce(txn.amount, 0))
          when lower(txn.type) = 'transfer'
            and txn.account_id::text = coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            ) and txn.transfer_direction in ('credit', 'in') then abs(coalesce(txn.amount, 0))
          when lower(txn.type) = 'expense'
            and txn.account_id::text <> coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            )
            and coalesce(txn.transfer_account_id::text, '') <> coalesce(
              nullif(debt.metadata->>'credit_card_account_id', ''),
              nullif(debt.metadata->>'auto_credit_card_account_id', ''),
              debt.payment_account_id::text
            ) then abs(coalesce(txn.amount, 0))
          else 0
        end
        else case
          when txn.related_entity_type = 'debt'
            and txn.related_entity_id = debt.id
            and lower(txn.type) = 'expense' then abs(coalesce(txn.amount, 0))
          when txn.related_entity_type = 'debt'
            and txn.related_entity_id = debt.id
            and lower(txn.type) = 'transfer'
            and txn.transfer_direction in ('', 'debit', 'out') then abs(coalesce(txn.amount, 0))
          else 0
        end
      end
    ), 0) as linked_repayments
  from public.debts as debt
  left join effective_transactions as txn
    on txn.user_id = debt.user_id
   and (
     txn.related_entity_type = 'debt' and txn.related_entity_id = debt.id
     or txn.metadata->>'credit_card_debt_id' = debt.id::text
   )
  where debt.deleted_at is null
  group by debt.id
), calculated as (
  select
    debt.*,
    ledger.is_credit_card,
    case when ledger.is_credit_card then debt.total_amount + ledger.card_charges else debt.total_amount end as calculated_total,
    debt.repaid_amount + ledger.linked_repayments
      + case when ledger.is_credit_card then 0 else coalesce(payment.paid_amount, 0) end as gross_paid
  from public.debts as debt
  join debt_ledger as ledger on ledger.debt_id = debt.id
  left join standalone_payment_totals as payment on payment.debt_id = debt.id
  where debt.deleted_at is null
), principal_amounts as (
  select
    debt.*,
    case
      when debt.is_credit_card then least(greatest(debt.gross_paid, 0), greatest(debt.calculated_total, 0))
      when debt.metadata->>'early_payoff' = 'true'
        and coalesce((debt.metadata->>'remaining_principal')::numeric, 0) <= 0.005
        then greatest(debt.calculated_total, 0)
      else public.calculate_debt_principal_paid(
        debt.calculated_total,
        debt.gross_paid,
        coalesce(debt.interest_rate, (debt.metadata->>'interest_rate')::numeric, 0),
        coalesce(debt.metadata->>'interest_rate_period', 'yearly'),
        case
          when nullif(debt.metadata->>'duration_months', '') ~ '^[0-9]+$'
            then (debt.metadata->>'duration_months')::integer
          else 0
        end,
        coalesce(debt.start_date, (debt.metadata->>'start_date')::date),
        coalesce(debt.monthly_payment, (debt.metadata->>'monthly_payment')::numeric, 0)
      )
    end as calculated_principal_paid
  from calculated as debt
), amounts as (
  select
    debt.*,
    debt.calculated_principal_paid as calculated_paid,
    case
      when debt.is_credit_card then greatest(debt.calculated_total - debt.gross_paid, 0)
      else greatest(debt.calculated_total - debt.calculated_principal_paid, 0)
    end as calculated_remaining
  from principal_amounts as debt
)
select
  debt.id as debt_id,
  debt.user_id,
  debt.name,
  coalesce(debt.lender_name, debt.lender) as lender_name,
  debt.calculated_total::numeric(14, 2) as total_amount,
  debt.initial_paid_amount,
  debt.calculated_paid as paid_amount,
  debt.calculated_remaining as remaining_amount,
  case
    when debt.calculated_total <= 0 then 0
    else round(least(greatest(debt.calculated_paid / debt.calculated_total, 0), 1) * 100, 2)
  end as progress_percentage,
  debt.start_date,
  coalesce(debt.next_payment_date, debt.due_date) as due_date,
  coalesce(debt.repayment_amount, debt.monthly_payment)::numeric(14, 2) as repayment_amount,
  debt.repayment_cycle,
  case
    when debt.calculated_remaining <= 0.005 then 'paid'
    when coalesce(debt.next_payment_date, debt.due_date) < current_date then 'overdue'
    else 'active'
  end as status,
  debt.created_at,
  debt.updated_at
from amounts as debt;

alter view public.v_debt_progress set (security_invoker = true);

create or replace function public.prevent_duplicate_transaction_reversal()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  source_id text := nullif(new.metadata->>'reversed_transaction_id', '');
  reversal_group_id text := coalesce(
    nullif(new.metadata->>'transfer_group_id', ''),
    nullif(new.metadata->>'same_account_transfer_group_id', '')
  );
begin
  if source_id is null
    or new.deleted_at is not null
    or not public.transaction_status_is_finalized(new.status) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text || ':' || source_id, 0));
  if exists (
    select 1
    from public.transactions as existing
    where existing.user_id = new.user_id
      and existing.id <> new.id
      and existing.deleted_at is null
      and existing.metadata->>'reversed_transaction_id' = source_id
      and public.transaction_status_is_finalized(existing.status)
      and not (
        lower(coalesce(new.type, '')) = 'transfer'
        and reversal_group_id is not null
        and lower(coalesce(existing.type, '')) = 'transfer'
        and coalesce(
          nullif(existing.metadata->>'transfer_group_id', ''),
          nullif(existing.metadata->>'same_account_transfer_group_id', '')
        ) = reversal_group_id
      )
  ) or (
    lower(coalesce(new.type, '')) = 'transfer'
    and reversal_group_id is not null
    and (
      select count(*)
      from public.transactions as existing
      where existing.user_id = new.user_id
        and existing.id <> new.id
        and existing.deleted_at is null
        and existing.metadata->>'reversed_transaction_id' = source_id
        and public.transaction_status_is_finalized(existing.status)
        and lower(coalesce(existing.type, '')) = 'transfer'
        and coalesce(
          nullif(existing.metadata->>'transfer_group_id', ''),
          nullif(existing.metadata->>'same_account_transfer_group_id', '')
        ) = reversal_group_id
    ) >= 2
  ) then
    raise exception using
      errcode = '23505',
      message = 'duplicate_transaction_reversal',
      detail = 'The source transaction already has a posted reversal.';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_duplicate_transaction_reversal on public.transactions;
create trigger prevent_duplicate_transaction_reversal
before insert or update of metadata, status, deleted_at on public.transactions
for each row execute function public.prevent_duplicate_transaction_reversal();

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
