-- Account balances are transaction-driven in the app. Legacy/imported
-- initial_balance values remain stored for audit history but must not be added
-- to live account totals, otherwise the account lookup total double-counts
-- balances already represented by transaction rows.

create or replace view public.v_account_balances as
with posted_transactions as (
  select
    account_id,
    transfer_account_id,
    type,
    amount,
    metadata
  from public.transactions
  where deleted_at is null
    and account_id is not null
    and lower(coalesce(status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
),
transaction_effects as (
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
  select
    transfer_account_id as account_id,
    amount as balance_delta
  from posted_transactions
  where lower(type) = 'transfer'
    and transfer_account_id is not null
    and lower(coalesce(metadata->>'transfer_direction', '')) not in ('debit', 'credit')
),
transaction_deltas as (
  select
    account_id,
    sum(balance_delta) as balance_delta
  from transaction_effects
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
left join transaction_deltas as transaction_delta
  on transaction_delta.account_id = account.id
where account.deleted_at is null;

alter view public.v_account_balances set (security_invoker = true);
