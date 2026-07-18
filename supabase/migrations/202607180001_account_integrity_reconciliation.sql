-- Reconcile account integrity across type semantics, manual card openings, and
-- transaction-driven balances.
--
-- An account's type controls how every historical transaction is interpreted:
-- expenses are cash outflows for bank/wallet accounts but liability increases
-- for credit cards. Once history or another financial module references an
-- account, changing that type would silently rewrite prior financial results.

create or replace function public.prevent_used_account_type_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_type_key text;
  new_type_key text;
begin
  old_type_key := case regexp_replace(lower(coalesce(old.type, '')), '[\s_-]+', '', 'g')
    when 'bank' then 'bankaccount'
    when 'bankaccount' then 'bankaccount'
    when 'cash' then 'cash'
    when 'cashwallet' then 'cash'
    when 'creditcard' then 'creditcard'
    when 'digitalwallet' then 'digitalwallet'
    when 'saving' then 'savings'
    when 'savings' then 'savings'
    else regexp_replace(lower(coalesce(old.type, '')), '[\s_-]+', '', 'g')
  end;
  new_type_key := case regexp_replace(lower(coalesce(new.type, '')), '[\s_-]+', '', 'g')
    when 'bank' then 'bankaccount'
    when 'bankaccount' then 'bankaccount'
    when 'cash' then 'cash'
    when 'cashwallet' then 'cash'
    when 'creditcard' then 'creditcard'
    when 'digitalwallet' then 'digitalwallet'
    when 'saving' then 'savings'
    when 'savings' then 'savings'
    else regexp_replace(lower(coalesce(new.type, '')), '[\s_-]+', '', 'g')
  end;

  if (old_type_key = 'creditcard') is not distinct from (new_type_key = 'creditcard') then
    return new;
  end if;

  if (
    exists (
      select 1
      from public.transactions as txn
      where txn.user_id = old.user_id
        and (
          txn.account_id = old.id
          or txn.transfer_account_id = old.id
          or coalesce(txn.metadata, '{}'::jsonb)->>'credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.assets as asset
      where asset.user_id = old.user_id and asset.account_id = old.id
    )
    or exists (
      select 1
      from public.debts as debt
      where debt.user_id = old.user_id
        and (
          debt.account_id = old.id
          or debt.payment_account_id = old.id
          or coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id' = old.id::text
          or coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.savings_goals as goal
      where goal.user_id = old.user_id and goal.account_id = old.id
    )
    or exists (
      select 1 from public.subscriptions as subscription
      where subscription.user_id = old.user_id and subscription.account_id = old.id
    )
    or exists (
      select 1 from public.scenario_items as item
      where item.user_id = old.user_id and item.account_id = old.id
    )
    or exists (
      select 1 from public.user_settings as settings
      where settings.user_id = old.user_id and settings.default_account_id = old.id
    )
  )
  then
    raise exception 'Used financial accounts cannot change between credit-card and cash-account types.'
      using errcode = '23503';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_used_account_type_change on public.accounts;
create trigger prevent_used_account_type_change
before update of type on public.accounts
for each row execute function public.prevent_used_account_type_change();

-- Manual credit-card debts may contain an opening liability/credit that
-- predates the transaction ledger. Add that signed opening exactly once to
-- the account view. Automatic card debts are transaction-driven and are
-- deliberately excluded, as are ordinary loans that merely use a card as a
-- payment account.
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

-- Current dashboard totals follow the same status rule as the Accounts UI:
-- Active and Needs Review rows contribute; Archived (`is_active = false`) do
-- not. The account view remains complete so archived history is still auditable.
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
    and lower(coalesce(status, 'cleared')) not in ('cancelled', 'canceled', 'void', 'failed')
  group by user_id
), debt_counts as (
  select user_id, count(*) as active_debt_count
  from public.debts
  where deleted_at is null and lower(status) = 'active'
  group by user_id
), savings_counts as (
  select user_id, count(*) as active_savings_goal_count
  from public.savings_goals
  where deleted_at is null and lower(status) = 'active'
  group by user_id
), subscription_counts as (
  select user_id, count(*) as active_subscription_count
  from public.subscriptions
  where deleted_at is null and lower(status) = 'active'
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
