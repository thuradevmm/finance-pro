-- Keep the reporting debt view aligned with the application ledger: posted
-- transactions only, transfer-pair de-duplication, reversal cancellation,
-- standard repayments, credit-card charges/payments, and dual debt links.

-- Allocate gross installment-loan payments through contractual interest before
-- principal. Keeping this calculation in SQL means reporting stays correct for
-- legacy/direct debt_payments too, even before an app reconciliation snapshot.
create or replace function public.calculate_debt_principal_paid(
  principal_amount numeric,
  gross_paid_amount numeric,
  interest_rate numeric,
  interest_rate_period text,
  duration_months integer,
  start_date date,
  monthly_payment numeric
)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  contractual_balance numeric := greatest(coalesce(principal_amount, 0), 0);
  remaining_payment numeric := greatest(coalesce(gross_paid_amount, 0), 0);
  principal_paid numeric := 0;
  regular_payment numeric := greatest(coalesce(monthly_payment, 0), 0);
  monthly_rate numeric;
  previous_due_date date := start_date;
  installment_due_date date;
  installment_interest numeric;
  installment_payment numeric;
  installment_principal numeric;
  applied_to_installment numeric;
  installment_index integer;
begin
  if contractual_balance <= 0 or remaining_payment <= 0 then return 0; end if;
  if duration_months is null or duration_months <= 0 or start_date is null then
    return least(remaining_payment, contractual_balance);
  end if;

  monthly_rate := case
    when lower(coalesce(interest_rate_period, 'yearly')) = 'monthly'
      then greatest(coalesce(interest_rate, 0), 0) / 100
    else greatest(coalesce(interest_rate, 0), 0) / 1200
  end;
  if regular_payment <= 0 then
    regular_payment := case
      when monthly_rate <= 0 then round(contractual_balance / duration_months, 2)
      else round(contractual_balance * (monthly_rate / (1 - power(1 + monthly_rate, -duration_months))), 2)
    end;
  end if;

  for installment_index in 1..duration_months loop
    installment_due_date := (start_date + make_interval(months => installment_index))::date;
    installment_interest := round(case
      when greatest(coalesce(interest_rate, 0), 0) <= 0 then 0
      when lower(coalesce(interest_rate_period, 'yearly')) = 'monthly'
        then contractual_balance * greatest(coalesce(interest_rate, 0), 0) / 100
      else contractual_balance * greatest(coalesce(interest_rate, 0), 0) / 100
        * greatest(installment_due_date - previous_due_date, 0) / 365
    end, 2);
    installment_payment := case
      when installment_index = duration_months
        then round(contractual_balance + installment_interest, 2)
      else regular_payment
    end;
    installment_principal := least(
      greatest(round(installment_payment - installment_interest, 2), 0),
      contractual_balance
    );
    applied_to_installment := least(remaining_payment, installment_payment);
    principal_paid := principal_paid + least(
      greatest(round(applied_to_installment - installment_interest, 2), 0),
      installment_principal
    );
    remaining_payment := greatest(round(remaining_payment - applied_to_installment, 2), 0);
    contractual_balance := greatest(round(contractual_balance - installment_principal, 2), 0);
    previous_due_date := installment_due_date;
    exit when remaining_payment <= 0.005 or contractual_balance <= 0.005;
  end loop;

  return least(greatest(round(principal_paid, 2), 0), greatest(coalesce(principal_amount, 0), 0));
end;
$$;

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
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
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
    or lower(coalesce(new.status, 'cleared')) in ('scheduled', 'cancelled', 'canceled', 'void', 'failed') then
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
      and lower(coalesce(existing.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
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
        and lower(coalesce(existing.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
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
