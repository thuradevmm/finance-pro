-- Reconcile debt rows created before numeric columns were introduced. Those
-- columns were added with zero defaults while authoritative non-zero values
-- remained in metadata, causing repayments, interest, and monthly payments to
-- disappear from calculations until the record was edited.
with legacy_values as (
  select
    debt.id,
    case when debt.metadata->>'total_amount' ~ '^-?[0-9]+(\.[0-9]+)?$' then (debt.metadata->>'total_amount')::numeric else 0 end as total_amount,
    case when debt.metadata->>'repaid_amount' ~ '^-?[0-9]+(\.[0-9]+)?$' then (debt.metadata->>'repaid_amount')::numeric else 0 end as repaid_amount,
    case when debt.metadata->>'monthly_payment' ~ '^-?[0-9]+(\.[0-9]+)?$' then (debt.metadata->>'monthly_payment')::numeric else 0 end as monthly_payment,
    case when debt.metadata->>'interest_rate' ~ '^-?[0-9]+(\.[0-9]+)?$' then (debt.metadata->>'interest_rate')::numeric else 0 end as interest_rate
  from public.debts as debt
  where debt.deleted_at is null
)
update public.debts as debt
set
  total_amount = case when debt.total_amount = 0 and legacy.total_amount <> 0 then legacy.total_amount else debt.total_amount end,
  repaid_amount = case when debt.repaid_amount = 0 and legacy.repaid_amount <> 0 then legacy.repaid_amount else debt.repaid_amount end,
  monthly_payment = case when debt.monthly_payment = 0 and legacy.monthly_payment <> 0 then legacy.monthly_payment else debt.monthly_payment end,
  interest_rate = case when debt.interest_rate = 0 and legacy.interest_rate <> 0 then legacy.interest_rate else debt.interest_rate end,
  updated_at = now()
from legacy_values as legacy
where legacy.id = debt.id
  and (
    debt.total_amount = 0 and legacy.total_amount <> 0
    or debt.repaid_amount = 0 and legacy.repaid_amount <> 0
    or debt.monthly_payment = 0 and legacy.monthly_payment <> 0
    or debt.interest_rate = 0 and legacy.interest_rate <> 0
  );
