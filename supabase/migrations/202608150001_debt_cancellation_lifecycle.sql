-- Borrowing & Lending cancellation is a financial state, not simple archive.
-- Historical cash activity remains posted, while the outstanding liability or
-- receivable stops contributing to position reporting from the cancellation
-- date. Older archived rows are upgraded because archive was previously the
-- only user-facing way to express this outcome.

with cancellation_targets as (
  select
    debt.id,
    debt.user_id,
    coalesce(debt.archived_at, debt.updated_at, debt.created_at, now()) as canceled_at
  from public.debts as debt
  where debt.deleted_at is null
    and not (
      coalesce(debt.metadata ->> 'auto_credit_card_terms', 'false') = 'true'
      and coalesce(debt.metadata ->> 'manual_credit_card_terms', 'false') <> 'true'
    )
    and (
      debt.is_active = false
      or debt.archived_at is not null
      or lower(btrim(coalesce(debt.status, ''))) in ('archived', 'canceled', 'cancelled')
      or lower(btrim(coalesce(debt.metadata ->> 'lifecycle_status', ''))) in (
        'archived', 'canceled', 'cancelled', 'deactivated', 'inactive'
      )
    )
)
update public.debts as debt
set is_active = false,
    archived_at = target.canceled_at,
    metadata = coalesce(debt.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'archived_at', null,
        'canceled_at', target.canceled_at,
        'cancellation_reason', 'obligation_waived_or_receivable_abandoned',
        'cancellation_status', 'canceled',
        'is_active', false,
        'lifecycle_status', 'canceled',
        'retirement_reason', 'financial_cancellation',
        'status_before_cancellation', coalesce(
          debt.metadata ->> 'status_before_cancellation',
          debt.metadata ->> 'status_before_deactivation',
          nullif(debt.status, ''),
          debt.metadata ->> 'status',
          'active'
        )
      )
      || jsonb_build_object(
        'cancellation_events',
        case
          when jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb) -> 'cancellation_events') = 'array'
            then debt.metadata -> 'cancellation_events'
          else '[]'::jsonb
        end || jsonb_build_array(jsonb_build_object('at', target.canceled_at, 'state', 'canceled'))
      )
from cancellation_targets as target
where debt.id = target.id
  and debt.user_id = target.user_id;

comment on column public.debts.archived_at is
  'Legacy-compatible inactive timestamp. For Borrowing & Lending rows, cancellation details and effective-dated events are stored in metadata.';
