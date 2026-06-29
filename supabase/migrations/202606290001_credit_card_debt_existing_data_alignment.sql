-- Align existing credit card debt rows with the current automatic debt flow.
--
-- This migration is intentionally conservative:
-- - Existing auto-created credit card debts keep automatic one-month/full-payment terms.
-- - Existing credit card debts that no longer carry the auto metadata are treated as
--   manually configured so user-edited schedules are not overwritten.
-- - Missing debt categories are filled with an active user-owned debt category.

create temp table if not exists tmp_credit_card_debt_candidates (
  debt_id uuid primary key,
  user_id uuid not null,
  credit_card_account_id uuid
) on commit drop;

truncate table tmp_credit_card_debt_candidates;

insert into tmp_credit_card_debt_candidates (debt_id, user_id, credit_card_account_id)
with linked_credit_cards as (
  select
    txn.related_entity_id::uuid as debt_id,
    txn.user_id,
    min(account.id)::uuid as credit_card_account_id
  from public.transactions as txn
  join public.accounts as account
    on account.user_id = txn.user_id
   and account.deleted_at is null
   and (account.id = txn.account_id or account.id = txn.transfer_account_id)
  where txn.related_entity_type = 'debt'
    and txn.related_entity_id is not null
    and txn.deleted_at is null
    and regexp_replace(lower(coalesce(account.type, '')), '[\s_-]+', '', 'g') = 'creditcard'
  group by txn.related_entity_id, txn.user_id
),
candidate_debts as (
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
      linked_credit_cards.credit_card_account_id,
      case
        when payment_account.id is not null then debt.payment_account_id
        else null
      end
    ) as credit_card_account_id
  from public.debts as debt
  left join linked_credit_cards
    on linked_credit_cards.debt_id = debt.id
   and linked_credit_cards.user_id = debt.user_id
  left join public.accounts as payment_account
    on payment_account.id = debt.payment_account_id
   and payment_account.user_id = debt.user_id
   and payment_account.deleted_at is null
   and regexp_replace(lower(coalesce(payment_account.type, '')), '[\s_-]+', '', 'g') = 'creditcard'
  where debt.deleted_at is null
    and debt.user_id is not null
    and (
      coalesce(debt.metadata, '{}'::jsonb) ? 'credit_card_account_id'
      or coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
      or regexp_replace(lower(coalesce(debt.type, coalesce(debt.metadata, '{}'::jsonb)->>'type', '')), '[\s_-]+', '', 'g') = 'creditcard'
      or linked_credit_cards.credit_card_account_id is not null
    )
)
select debt_id, user_id, credit_card_account_id
from candidate_debts
on conflict (debt_id) do update
set user_id = excluded.user_id,
    credit_card_account_id = coalesce(excluded.credit_card_account_id, tmp_credit_card_debt_candidates.credit_card_account_id);

insert into public.categories (
  user_id,
  name,
  type,
  color,
  icon,
  is_active,
  is_default,
  metadata
)
select distinct
  candidate.user_id,
  'Credit Card Debt',
  'expense',
  'Amber',
  'credit',
  true,
  false,
  jsonb_build_object(
    'category_type', 'Debt',
    'description', 'Automatically created for credit card debt tracking.',
    'scopes', jsonb_build_array('Debts', 'Reports'),
    'system_created', true
  )
from tmp_credit_card_debt_candidates as candidate
where not exists (
  select 1
  from public.categories as category
  where category.user_id = candidate.user_id
    and category.deleted_at is null
    and category.is_active = true
    and (
      coalesce(category.metadata, '{}'::jsonb)->>'category_type' in ('Debt', 'Debts')
      or coalesce(category.metadata, '{}'::jsonb)->'scopes' ? 'Debts'
    )
);

with preferred_debt_categories as (
  select distinct on (category.user_id)
    category.user_id,
    category.id
  from public.categories as category
  where category.deleted_at is null
    and category.is_active = true
    and (
      coalesce(category.metadata, '{}'::jsonb)->>'category_type' in ('Debt', 'Debts')
      or coalesce(category.metadata, '{}'::jsonb)->'scopes' ? 'Debts'
    )
  order by
    category.user_id,
    case when lower(coalesce(category.name, '')) like '%credit%' then 0 else 1 end,
    category.created_at,
    category.id
)
update public.debts as debt
set category_id = coalesce(debt.category_id, preferred_debt_categories.id),
    type = coalesce(debt.type, 'Credit Card'),
    metadata = jsonb_strip_nulls(
      coalesce(debt.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'category_id', coalesce(debt.category_id, preferred_debt_categories.id),
        'credit_card_account_id', coalesce(candidate.credit_card_account_id::text, coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id', coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id'),
        'auto_credit_card_account_id', case
          when coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
            then coalesce(candidate.credit_card_account_id::text, coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id')
          else null
        end,
        'auto_credit_card_terms', case
          when lower(coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_terms') in ('true', 'false')
            then (coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_terms')::boolean
          when coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
            then true
          else false
        end,
        'manual_credit_card_terms', case
          when lower(coalesce(debt.metadata, '{}'::jsonb)->>'manual_credit_card_terms') in ('true', 'false')
            then (coalesce(debt.metadata, '{}'::jsonb)->>'manual_credit_card_terms')::boolean
          when coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
            then false
          else true
        end,
        'requires_full_payment', case
          when lower(coalesce(debt.metadata, '{}'::jsonb)->>'requires_full_payment') in ('true', 'false')
            then (coalesce(debt.metadata, '{}'::jsonb)->>'requires_full_payment')::boolean
          when coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
            then true
          else false
        end,
        'duration_months', case
          when coalesce(debt.metadata, '{}'::jsonb) ? 'auto_credit_card_account_id'
            then 1
          else null
        end
      )
    ),
    updated_at = now()
from tmp_credit_card_debt_candidates as candidate
left join preferred_debt_categories
  on preferred_debt_categories.user_id = candidate.user_id
where debt.id = candidate.debt_id
  and debt.user_id = candidate.user_id;

create temp table if not exists tmp_credit_card_debt_ledger (
  debt_id uuid primary key,
  charged_amount numeric not null default 0,
  repaid_amount numeric not null default 0
) on commit drop;

truncate table tmp_credit_card_debt_ledger;

insert into tmp_credit_card_debt_ledger (debt_id, charged_amount, repaid_amount)
select
  candidate.debt_id,
  coalesce(sum(
    case
      when txn.account_id = candidate.credit_card_account_id
        and lower(txn.type) = 'expense'
        then abs(txn.amount)
      when txn.account_id = candidate.credit_card_account_id
        and lower(txn.type) = 'transfer'
        and lower(coalesce(txn.metadata->>'transfer_direction', '')) in ('', 'debit')
        then abs(txn.amount)
      else 0
    end
  ), 0) as charged_amount,
  coalesce(sum(
    case
      when txn.account_id = candidate.credit_card_account_id
        and lower(txn.type) = 'income'
        then abs(txn.amount)
      when txn.account_id = candidate.credit_card_account_id
        and lower(txn.type) = 'transfer'
        and lower(coalesce(txn.metadata->>'transfer_direction', '')) = 'credit'
        then abs(txn.amount)
      when txn.transfer_account_id = candidate.credit_card_account_id
        and lower(txn.type) = 'transfer'
        and lower(coalesce(txn.metadata->>'transfer_direction', '')) = ''
        then abs(txn.amount)
      else 0
    end
  ), 0) as repaid_amount
from tmp_credit_card_debt_candidates as candidate
join public.transactions as txn
  on txn.user_id = candidate.user_id
 and txn.related_entity_type = 'debt'
 and txn.related_entity_id = candidate.debt_id
 and txn.deleted_at is null
 and lower(coalesce(txn.status, 'cleared')) <> 'scheduled'
where candidate.credit_card_account_id is not null
group by candidate.debt_id;

update public.debts as debt
set monthly_payment = case
      when greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0) <= 0.005
        then 0
      else greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0)
    end,
    status = case
      when greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0) <= 0.005
        then 'paid'
      else 'active'
    end,
    metadata = jsonb_strip_nulls(
      coalesce(debt.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'duration_months', 1,
        'monthly_payment', case
          when greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0) <= 0.005
            then 0
          else greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0)
        end,
        'requires_full_payment', true,
        'status', case
          when greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0) <= 0.005
            then 'paid'
          else 'active'
        end,
        'paid_at', case
          when greatest(coalesce(debt.total_amount, 0) + coalesce(ledger.charged_amount, 0) - coalesce(debt.repaid_amount, 0) - coalesce(ledger.repaid_amount, 0), 0) <= 0.005
            then now()
          else null
        end
      )
    ),
    updated_at = now()
from tmp_credit_card_debt_candidates as candidate
left join tmp_credit_card_debt_ledger as ledger
  on ledger.debt_id = candidate.debt_id
where debt.id = candidate.debt_id
  and debt.user_id = candidate.user_id
  and lower(coalesce(debt.status, 'active')) <> 'archived'
  and lower(coalesce(debt.metadata->>'auto_credit_card_terms', 'false')) = 'true'
  and lower(coalesce(debt.metadata->>'manual_credit_card_terms', 'false')) <> 'true';
