-- Backfill subscription payment evidence with billing currency and exchange-rate
-- metadata where older linked payments only stored the MMK transaction amount.

with payment_source as (
  select
    payment.id as payment_id,
    coalesce(payment.metadata, '{}'::jsonb) as payment_metadata,
    abs(coalesce(payment.amount, 0)) as payment_amount,
    coalesce(subscription.metadata, '{}'::jsonb) as subscription_metadata,
    coalesce(subscription.amount, 0) as subscription_amount,
    lower(coalesce(subscription.billing_cycle, subscription.metadata->>'billing_cycle', 'monthly')) as billing_cycle,
    coalesce(payment.metadata->>'billing_due_date', subscription.next_billing_date::text, subscription.metadata->>'next_billing_date') as billing_due_date,
    case
      when nullif(payment.metadata->>'billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment.metadata->>'billed_amount')::numeric
      else null
    end as payment_billed_amount,
    case
      when nullif(payment.metadata->>'configured_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment.metadata->>'configured_exchange_rate')::numeric
      else null
    end as payment_configured_exchange_rate,
    case
      when nullif(payment.metadata->>'payment_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment.metadata->>'payment_exchange_rate')::numeric
      else null
    end as payment_exchange_rate,
    case
      when nullif(payment.metadata->>'exchange_difference_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment.metadata->>'exchange_difference_amount')::numeric
      else null
    end as payment_exchange_difference_amount,
    case
      when nullif(subscription.metadata->>'billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (subscription.metadata->>'billed_amount')::numeric
      else null
    end as subscription_billed_amount,
    case
      when nullif(subscription.metadata->>'exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (subscription.metadata->>'exchange_rate')::numeric
      else null
    end as subscription_exchange_rate
  from public.subscription_payments as payment
  join public.subscriptions as subscription
    on subscription.id = payment.subscription_id
   and subscription.user_id = payment.user_id
   and subscription.deleted_at is null
  where (
    nullif(coalesce(payment.metadata, '{}'::jsonb)->>'billing_currency', '') is null
    or nullif(coalesce(payment.metadata, '{}'::jsonb)->>'billed_amount', '') is null
    or nullif(coalesce(payment.metadata, '{}'::jsonb)->>'payment_exchange_rate', '') is null
  )
),
payment_normalized as (
  select
    payment_id,
    payment_metadata,
    payment_amount,
    billing_cycle,
    billing_due_date,
    coalesce(nullif(upper(payment_metadata->>'billing_currency'), ''), nullif(upper(subscription_metadata->>'billing_currency'), ''), 'MMK') as billing_currency,
    coalesce(payment_billed_amount, subscription_billed_amount, payment_amount) as billed_amount,
    payment_configured_exchange_rate,
    payment_exchange_difference_amount,
    payment_exchange_rate,
    subscription_amount,
    subscription_exchange_rate
  from payment_source
),
payment_ready as (
  select
    *,
    case
      when billing_currency = 'MMK' then 1
      else coalesce(
        payment_configured_exchange_rate,
        subscription_exchange_rate,
        case when billed_amount > 0 then subscription_amount / billed_amount else null end,
        1
      )
    end as configured_exchange_rate,
    case
      when billing_currency = 'MMK' then 1
      else coalesce(
        payment_exchange_rate,
        case when billed_amount > 0 then payment_amount / billed_amount else null end,
        payment_configured_exchange_rate,
        subscription_exchange_rate,
        1
      )
    end as applied_exchange_rate
  from payment_normalized
)
update public.subscription_payments as payment
set metadata = jsonb_strip_nulls(
  normalized.payment_metadata
  || jsonb_build_object(
    'billed_amount', normalized.billed_amount,
    'billing_currency', normalized.billing_currency,
    'billing_cycle', coalesce(normalized.payment_metadata->>'billing_cycle', normalized.billing_cycle),
    'billing_due_date', normalized.billing_due_date,
    'configured_exchange_rate', normalized.configured_exchange_rate,
    'payment_exchange_rate', normalized.applied_exchange_rate,
    'exchange_difference_amount', coalesce(
      normalized.payment_exchange_difference_amount,
      normalized.payment_amount - (normalized.billed_amount * normalized.configured_exchange_rate)
    )
  )
),
updated_at = now()
from payment_ready as normalized
where payment.id = normalized.payment_id;

with transaction_source as (
  select
    txn.id as transaction_id,
    coalesce(txn.metadata, '{}'::jsonb) as transaction_metadata,
    abs(coalesce(txn.amount, 0)) as payment_amount,
    txn.transaction_date,
    coalesce(subscription.metadata, '{}'::jsonb) as subscription_metadata,
    coalesce(subscription.amount, 0) as subscription_amount,
    lower(coalesce(subscription.billing_cycle, subscription.metadata->>'billing_cycle', 'monthly')) as billing_cycle,
    coalesce(txn.metadata->>'subscription_billing_due_date', subscription.next_billing_date::text, subscription.metadata->>'next_billing_date', txn.transaction_date::text) as billing_due_date,
    case
      when nullif(txn.metadata->>'subscription_billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (txn.metadata->>'subscription_billed_amount')::numeric
      else null
    end as transaction_billed_amount,
    case
      when nullif(txn.metadata->>'subscription_configured_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (txn.metadata->>'subscription_configured_exchange_rate')::numeric
      else null
    end as transaction_configured_exchange_rate,
    case
      when nullif(txn.metadata->>'subscription_payment_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (txn.metadata->>'subscription_payment_exchange_rate')::numeric
      else null
    end as transaction_payment_exchange_rate,
    case
      when nullif(txn.metadata->>'subscription_exchange_difference_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (txn.metadata->>'subscription_exchange_difference_amount')::numeric
      else null
    end as transaction_exchange_difference_amount,
    case
      when nullif(txn.metadata->>'subscription_expected_payment_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (txn.metadata->>'subscription_expected_payment_amount')::numeric
      else null
    end as transaction_expected_payment_amount,
    case
      when nullif(subscription.metadata->>'billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (subscription.metadata->>'billed_amount')::numeric
      else null
    end as subscription_billed_amount,
    case
      when nullif(subscription.metadata->>'exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (subscription.metadata->>'exchange_rate')::numeric
      else null
    end as subscription_exchange_rate
  from public.transactions as txn
  join public.subscriptions as subscription
    on subscription.id = txn.related_entity_id
   and subscription.user_id = txn.user_id
   and subscription.deleted_at is null
  where txn.related_entity_type = 'subscription'
    and lower(coalesce(txn.type, '')) = 'expense'
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
    and txn.deleted_at is null
    and (
      nullif(coalesce(txn.metadata, '{}'::jsonb)->>'subscription_billing_currency', '') is null
      or nullif(coalesce(txn.metadata, '{}'::jsonb)->>'subscription_billed_amount', '') is null
      or nullif(coalesce(txn.metadata, '{}'::jsonb)->>'subscription_payment_exchange_rate', '') is null
    )
),
transaction_normalized as (
  select
    transaction_id,
    transaction_metadata,
    payment_amount,
    billing_cycle,
    billing_due_date,
    coalesce(nullif(upper(transaction_metadata->>'subscription_billing_currency'), ''), nullif(upper(subscription_metadata->>'billing_currency'), ''), 'MMK') as billing_currency,
    coalesce(transaction_billed_amount, subscription_billed_amount, payment_amount) as billed_amount,
    transaction_configured_exchange_rate,
    transaction_exchange_difference_amount,
    transaction_expected_payment_amount,
    transaction_payment_exchange_rate,
    subscription_amount,
    subscription_exchange_rate
  from transaction_source
),
transaction_ready as (
  select
    *,
    case
      when billing_currency = 'MMK' then 1
      else coalesce(
        transaction_configured_exchange_rate,
        subscription_exchange_rate,
        case when billed_amount > 0 then subscription_amount / billed_amount else null end,
        1
      )
    end as configured_exchange_rate,
    case
      when billing_currency = 'MMK' then 1
      else coalesce(
        transaction_payment_exchange_rate,
        case when billed_amount > 0 then payment_amount / billed_amount else null end,
        transaction_configured_exchange_rate,
        subscription_exchange_rate,
        1
      )
    end as applied_exchange_rate
  from transaction_normalized
)
update public.transactions as txn
set metadata = jsonb_strip_nulls(
  normalized.transaction_metadata
  || jsonb_build_object(
    'subscription_billed_amount', normalized.billed_amount,
    'subscription_billing_currency', normalized.billing_currency,
    'subscription_billing_cycle', coalesce(normalized.transaction_metadata->>'subscription_billing_cycle', normalized.billing_cycle),
    'subscription_billing_due_date', normalized.billing_due_date,
    'subscription_configured_exchange_rate', normalized.configured_exchange_rate,
    'subscription_exchange_difference_amount', coalesce(
      normalized.transaction_exchange_difference_amount,
      normalized.payment_amount - (normalized.billed_amount * normalized.configured_exchange_rate)
    ),
    'subscription_expected_payment_amount', coalesce(
      normalized.transaction_expected_payment_amount,
      normalized.billed_amount * normalized.applied_exchange_rate
    ),
    'subscription_payment_amount', normalized.payment_amount,
    'subscription_payment_exchange_rate', normalized.applied_exchange_rate
  )
),
updated_at = now()
from transaction_ready as normalized
where txn.id = normalized.transaction_id;

with latest_subscription_payment as (
  select distinct on (payment.subscription_id)
    subscription.id as subscription_id,
    coalesce(subscription.metadata, '{}'::jsonb) as subscription_metadata,
    payment.amount as payment_amount,
    payment.payment_date,
    payment.transaction_id,
    coalesce(payment.metadata, '{}'::jsonb) as payment_metadata
  from public.subscription_payments as payment
  join public.subscriptions as subscription
    on subscription.id = payment.subscription_id
   and subscription.user_id = payment.user_id
   and subscription.deleted_at is null
  where (
    nullif(coalesce(subscription.metadata, '{}'::jsonb)->>'last_payment_billed_amount', '') is null
    or nullif(coalesce(subscription.metadata, '{}'::jsonb)->>'last_payment_billing_currency', '') is null
    or nullif(coalesce(subscription.metadata, '{}'::jsonb)->>'last_payment_exchange_rate', '') is null
  )
  order by payment.subscription_id, payment.payment_date desc, payment.created_at desc
),
latest_subscription_payment_normalized as (
  select
    subscription_id,
    subscription_metadata,
    payment_amount,
    payment_date,
    transaction_id,
    payment_metadata,
    coalesce(nullif(upper(payment_metadata->>'billing_currency'), ''), nullif(upper(subscription_metadata->>'billing_currency'), ''), 'MMK') as billing_currency,
    case
      when nullif(payment_metadata->>'billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment_metadata->>'billed_amount')::numeric
      else payment_amount
    end as billed_amount,
    case
      when nullif(payment_metadata->>'configured_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment_metadata->>'configured_exchange_rate')::numeric
      else 1
    end as configured_exchange_rate,
    case
      when nullif(payment_metadata->>'payment_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        then (payment_metadata->>'payment_exchange_rate')::numeric
      else 1
    end as payment_exchange_rate
  from latest_subscription_payment
)
update public.subscriptions as subscription
set metadata = jsonb_strip_nulls(
  normalized.subscription_metadata
  || jsonb_build_object(
    'last_paid_billing_date', coalesce(normalized.subscription_metadata->>'last_paid_billing_date', normalized.payment_metadata->>'billing_due_date'),
    'last_payment_amount', coalesce(
      case
        when nullif(normalized.subscription_metadata->>'last_payment_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (normalized.subscription_metadata->>'last_payment_amount')::numeric
        else null
      end,
      normalized.payment_amount
    ),
    'last_payment_billed_amount', coalesce(
      case
        when nullif(normalized.subscription_metadata->>'last_payment_billed_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (normalized.subscription_metadata->>'last_payment_billed_amount')::numeric
        else null
      end,
      normalized.billed_amount
    ),
    'last_payment_billing_currency', coalesce(normalized.subscription_metadata->>'last_payment_billing_currency', normalized.billing_currency),
    'last_payment_configured_exchange_rate', coalesce(
      case
        when nullif(normalized.subscription_metadata->>'last_payment_configured_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (normalized.subscription_metadata->>'last_payment_configured_exchange_rate')::numeric
        else null
      end,
      normalized.configured_exchange_rate
    ),
    'last_payment_date', coalesce(normalized.subscription_metadata->>'last_payment_date', normalized.payment_date::text),
    'last_payment_exchange_rate', coalesce(
      case
        when nullif(normalized.subscription_metadata->>'last_payment_exchange_rate', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (normalized.subscription_metadata->>'last_payment_exchange_rate')::numeric
        else null
      end,
      normalized.payment_exchange_rate
    ),
    'last_payment_transaction_id', coalesce(normalized.subscription_metadata->>'last_payment_transaction_id', normalized.transaction_id::text)
  )
),
updated_at = now()
from latest_subscription_payment_normalized as normalized
where subscription.id = normalized.subscription_id;
