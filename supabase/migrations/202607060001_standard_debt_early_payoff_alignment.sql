-- Align the existing A Bank staff loan with the early-payoff debt flow.
--
-- The linked transaction ledger shows the original principal has been covered
-- without paying the remaining future EMI interest. This migration marks only
-- that identified staff-loan debt as paid when its posted linked repayments
-- cover principal.

with candidate_debts as (
  select
    debt.id,
    debt.user_id,
    coalesce(
      nullif(debt.total_amount, 0),
      nullif(
        case
          when nullif(coalesce(debt.metadata, '{}'::jsonb)->>'total_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (coalesce(debt.metadata, '{}'::jsonb)->>'total_amount')::numeric
          else null
        end,
        0
      ),
      0
    ) as principal_amount,
    coalesce(debt.repaid_amount, 0) + coalesce(
      case
        when nullif(coalesce(debt.metadata, '{}'::jsonb)->>'repaid_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (coalesce(debt.metadata, '{}'::jsonb)->>'repaid_amount')::numeric
        else null
      end,
      0
    ) as stored_repaid_amount,
    lower(concat_ws(
      ' ',
      debt.name,
      debt.lender,
      debt.type,
      coalesce(debt.metadata, '{}'::jsonb)->>'type',
      coalesce(debt.metadata, '{}'::jsonb)->>'lender'
    )) as searchable_text
  from public.debts as debt
  where debt.deleted_at is null
    and coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id' is null
    and coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id' is null
),
linked_repayments as (
  select
    candidate.id as debt_id,
    coalesce(sum(abs(txn.amount)), 0) as linked_repaid_amount,
    max(txn.transaction_date) as latest_payment_date
  from candidate_debts as candidate
  join public.transactions as txn
    on txn.user_id = candidate.user_id
   and txn.related_entity_type = 'debt'
   and txn.related_entity_id = candidate.id
   and txn.deleted_at is null
   and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
   and (
      lower(coalesce(txn.type, '')) in ('expense', 'income')
      or (
        lower(coalesce(txn.type, '')) = 'transfer'
        and lower(coalesce(txn.metadata->>'transfer_direction', txn.metadata->>'same_account_transfer_role', '')) not in ('credit', 'in')
      )
    )
  group by candidate.id
),
latest_repayment as (
  select distinct on (candidate.id)
    candidate.id as debt_id,
    abs(txn.amount) as amount
  from candidate_debts as candidate
  join public.transactions as txn
    on txn.user_id = candidate.user_id
   and txn.related_entity_type = 'debt'
   and txn.related_entity_id = candidate.id
   and txn.deleted_at is null
   and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
  order by candidate.id, txn.transaction_date desc, txn.created_at desc, txn.id desc
),
payoff_candidates as (
  select
    candidate.id,
    candidate.principal_amount,
    candidate.stored_repaid_amount,
    coalesce(linked.linked_repaid_amount, 0) as linked_repaid_amount,
    coalesce(linked.latest_payment_date, current_date) as latest_payment_date,
    coalesce(latest.amount, 0) as latest_payment_amount
  from candidate_debts as candidate
  join linked_repayments as linked
    on linked.debt_id = candidate.id
  left join latest_repayment as latest
    on latest.debt_id = candidate.id
  where candidate.searchable_text like '%a bank%'
    and candidate.searchable_text like '%staff%'
    and candidate.searchable_text like '%loan%'
)
update public.debts as debt
set
  monthly_payment = 0,
  next_payment_date = null,
  status = 'paid',
  metadata = jsonb_strip_nulls(
    coalesce(debt.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'early_payoff', true,
      'early_payoff_amount', payoff.latest_payment_amount,
      'early_payoff_date', payoff.latest_payment_date,
      'early_payoff_interest_amount', greatest(payoff.stored_repaid_amount + payoff.linked_repaid_amount - payoff.principal_amount, 0),
      'early_payoff_principal_amount', least(payoff.latest_payment_amount, payoff.principal_amount),
      'last_debt_reconciled_at', now(),
      'monthly_payment', 0,
      'next_payment_date', null,
      'paid_at', payoff.latest_payment_date::timestamptz,
      'principal_paid', payoff.principal_amount,
      'remaining_principal', 0,
      'status', 'paid'
    )
  ),
  updated_at = now()
from payoff_candidates as payoff
where debt.id = payoff.id
  and payoff.principal_amount > 0
  and payoff.stored_repaid_amount + payoff.linked_repaid_amount + 0.005 >= payoff.principal_amount
  and lower(coalesce(debt.status, 'active')) <> 'archived';
