-- A standard debt's start_date is the borrowing date, not an installment due
-- date. Repair legacy rows whose stored due date is on or before borrowing so
-- application fallbacks and reporting views agree with the EMI schedule.

with malformed_standard_debts as (
  select
    debt.id,
    (debt.start_date + interval '1 month')::date as corrected_due_date
  from public.debts as debt
  where debt.deleted_at is null
    and debt.start_date is not null
    and lower(coalesce(debt.status, debt.metadata->>'status', 'active')) <> 'paid'
    and lower(regexp_replace(coalesce(debt.type, debt.metadata->>'type', ''), '[^a-z0-9]+', '', 'g'))
      not in ('creditcard', 'creditcarddebt')
    and coalesce(
      debt.next_payment_date,
      debt.due_date,
      case
        when coalesce(debt.metadata->>'next_payment_date', '') ~ '^\d{4}-\d{2}-\d{2}$'
          then (debt.metadata->>'next_payment_date')::date
        else null
      end
    ) <= debt.start_date
)
update public.debts as debt
set
  next_payment_date = malformed.corrected_due_date,
  due_date = case
    when debt.due_date is null or debt.due_date <= debt.start_date
      then malformed.corrected_due_date
    else debt.due_date
  end,
  status = case
    when malformed.corrected_due_date < current_date then 'overdue'
    else 'active'
  end,
  metadata = coalesce(debt.metadata, '{}'::jsonb) || jsonb_build_object(
    'next_payment_date', malformed.corrected_due_date,
    'status', case
      when malformed.corrected_due_date < current_date then 'overdue'
      else 'active'
    end
  ),
  updated_at = now()
from malformed_standard_debts as malformed
where debt.id = malformed.id;
