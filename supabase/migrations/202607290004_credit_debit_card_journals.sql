-- Preserve legacy storage values (income/expense) while making new credit-card
-- charges explicit two-record Credit/Debit journals. Existing one-row card
-- charges remain valid and continue to reconcile through the legacy fallback.

update public.accounts
set
  metadata = coalesce(metadata, '{}'::jsonb)
    || jsonb_build_object('legacy_account_type', type),
  type = 'credit_card',
  updated_at = now()
where deleted_at is null
  and regexp_replace(lower(coalesce(type, '')), '[\s_-]+', '', 'g')
    in ('ayavisa', 'ayavisacard', 'ayavisacreditcard');

alter table public.transactions
  -- @allow-destructive-migration: replaces only this app-owned validation constraint with the expanded journal-role set.
  drop constraint if exists chk_credit_card_journal_role;

alter table public.transactions
  add constraint chk_credit_card_journal_role
  check (
    not (coalesce(metadata, '{}'::jsonb) ? 'credit_card_journal_role')
    or coalesce(metadata, '{}'::jsonb)->>'credit_card_journal_role' in (
      'liability_credit',
      'purchase_debit',
      'liability_credit_reversal',
      'purchase_debit_reversal'
    )
  );

create unique index if not exists uq_active_credit_card_journal_role
  on public.transactions (
    user_id,
    (metadata->>'credit_card_journal_group_id'),
    (metadata->>'credit_card_journal_role')
  )
  where deleted_at is null
    and nullif(metadata->>'credit_card_journal_group_id', '') is not null
    and nullif(metadata->>'credit_card_journal_role', '') is not null;

comment on constraint chk_credit_card_journal_role on public.transactions is
  'Limits linked card journal rows to the supported Credit/Debit and reversal roles.';

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
      when metadata->>'credit_card_journal_role' = 'liability_credit' then -abs(amount)
      when metadata->>'credit_card_journal_role' = 'liability_credit_reversal' then abs(amount)
      when metadata->>'credit_card_journal_role' in ('purchase_debit', 'purchase_debit_reversal') then 0
      when lower(type) = 'income' then amount
      when lower(type) = 'expense' then -amount
      when lower(type) = 'transfer'
        and lower(coalesce(metadata->>'transfer_direction', '')) = 'credit' then amount
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
   and regexp_replace(lower(coalesce(account.type, '')), '[\s_-]+', '', 'g')
     in ('creditcard', 'ayavisa', 'ayavisacard', 'ayavisacreditcard')
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
grant select on public.v_account_balances to anon, authenticated, service_role;

comment on view public.v_account_balances is
  'Working account balances with pending reservations, legacy card compatibility, and explicit card Credit/Debit journal handling.';
