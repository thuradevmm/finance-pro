-- Debt records historically stored the balance-sheet side only. Create the
-- missing cash-side origination transaction when an account is known and no
-- linked or exact legacy transaction can already represent that event.

with eligible_debts as (
  select
    debt.id,
    debt.user_id,
    debt.category_id,
    debt.name,
    debt.description,
    debt.payment_account_id,
    coalesce(debt.start_date, (debt.metadata->>'start_date')::date) as origination_date,
    coalesce(debt.total_amount, (debt.metadata->>'total_amount')::numeric, 0) as origination_amount,
    (
      lower(coalesce(debt.metadata->>'debt_nature', '')) = 'lending'
      or (
        coalesce(debt.metadata->>'debt_nature', '') = ''
        and debt.name ~* '^\s*lend(ing|t)?(\s|$)'
      )
    ) as is_lending,
    coalesce(
      nullif(account.metadata->'amount_types'->0->>'type', ''),
      'Operation'
    ) as account_amount_type
  from public.debts as debt
  join public.accounts as account
    on account.id = debt.payment_account_id
   and account.user_id = debt.user_id
   and account.deleted_at is null
  where debt.deleted_at is null
    and lower(coalesce(debt.status, debt.metadata->>'status', 'active')) <> 'archived'
    and coalesce(debt.total_amount, (debt.metadata->>'total_amount')::numeric, 0) > 0
    and coalesce(debt.start_date, (debt.metadata->>'start_date')::date) is not null
    and lower(regexp_replace(coalesce(debt.type, debt.metadata->>'type', ''), '[ _-]+', '', 'g')) <> 'creditcard'
    and coalesce(debt.metadata->>'credit_card_account_id', '') = ''
    and coalesce(debt.metadata->>'auto_credit_card_account_id', '') = ''
), missing_originations as (
  select debt.*
  from eligible_debts as debt
  where not exists (
    select 1
    from public.transactions as txn
    where txn.user_id = debt.user_id
      and txn.deleted_at is null
      and txn.related_entity_type = 'debt'
      and txn.related_entity_id = debt.id
      and txn.metadata->>'financial_event' = 'debt_origination'
  )
    and not exists (
      select 1
      from public.transactions as txn
      where txn.user_id = debt.user_id
        and txn.deleted_at is null
        and txn.account_id = debt.payment_account_id
        and txn.transaction_date = debt.origination_date
        and abs(txn.amount) = abs(debt.origination_amount)
        and lower(txn.type) = case when debt.is_lending then 'expense' else 'income' end
    )
)
insert into public.transactions (
  user_id,
  account_id,
  category_id,
  transaction_date,
  type,
  amount,
  title,
  description,
  note,
  status,
  related_entity_type,
  related_entity_id,
  metadata
)
select
  debt.user_id,
  debt.payment_account_id,
  debt.category_id,
  debt.origination_date,
  case when debt.is_lending then 'expense' else 'income' end,
  debt.origination_amount,
  debt.name || case when debt.is_lending then ' · lending funded' else ' · borrowing received' end,
  case when debt.is_lending then 'Money lent · ' else 'Borrowed money received · ' end || debt.name,
  debt.description,
  'cleared',
  'debt',
  debt.id,
  jsonb_build_object(
    'account_amount_type', debt.account_amount_type,
    'accounting_class', case when debt.is_lending then 'financing_payment' else 'financing_receipt' end,
    'accounting_version', 1,
    'debt_interest_amount', 0,
    'debt_principal_amount', debt.origination_amount,
    'debt_nature', case when debt.is_lending then 'lending' else 'borrowing' end,
    'financial_event', 'debt_origination',
    'legacy_backfill', true,
    'system_managed', true
  )
from missing_originations as debt;

comment on table public.transactions is
  'Financial events including operating activity, transfers, financing principal movements, and system-managed debt originations.';
