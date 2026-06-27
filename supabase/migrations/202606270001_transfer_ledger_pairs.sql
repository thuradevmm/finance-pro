-- Normalize transfers into paired ledger rows.
--
-- Each transfer now has two rows:
-- - transfer_direction = debit: money leaves the source account
-- - transfer_direction = credit: money enters the destination account
--
-- Both rows keep type = transfer so internal movement never contributes to
-- income or expense analysis.

update public.transactions
set type = 'transfer',
    category_id = null,
    transfer_account_id = nullif(metadata->>'transfer_account_id', '')::uuid,
    metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'transfer_group_id', coalesce(metadata->>'transfer_group_id', metadata->>'same_account_transfer_group_id'),
        'transfer_direction', case
          when metadata->>'same_account_transfer_role' = 'in' then 'credit'
          else 'debit'
        end,
        'counter_account_id', nullif(metadata->>'transfer_account_id', ''),
        'counter_account_amount_type', nullif(metadata->>'transfer_account_amount_type', '')
      )),
    updated_at = now()
where metadata ? 'same_account_transfer_role'
  and metadata->>'same_account_transfer_role' in ('out', 'in');

update public.transactions
set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_strip_nulls(jsonb_build_object(
        'transfer_group_id', id::text,
        'transfer_direction', 'debit',
        'counter_account_id', transfer_account_id::text,
        'counter_account_amount_type', nullif(metadata->>'transfer_account_amount_type', '')
      )),
    updated_at = now()
where lower(type) = 'transfer'
  and transfer_account_id is not null
  and not (coalesce(metadata, '{}'::jsonb) ? 'transfer_group_id')
  and not (coalesce(metadata, '{}'::jsonb) ? 'same_account_transfer_group_id');

insert into public.transactions (
  user_id,
  transaction_date,
  type,
  amount,
  account_id,
  transfer_account_id,
  category_id,
  payment_method,
  status,
  title,
  description,
  note,
  related_entity_type,
  related_entity_id,
  metadata,
  deleted_at,
  created_at,
  updated_at
)
select
  source.user_id,
  source.transaction_date,
  'transfer',
  source.amount,
  source.transfer_account_id,
  source.account_id,
  null,
  source.payment_method,
  source.status,
  source.title,
  source.description,
  source.note,
  source.related_entity_type,
  source.related_entity_id,
  jsonb_strip_nulls(jsonb_build_object(
    'account_amount_type', coalesce(nullif(source.metadata->>'transfer_account_amount_type', ''), nullif(source.metadata->>'account_amount_type', ''), 'General'),
    'transfer_account_amount_type', coalesce(nullif(source.metadata->>'account_amount_type', ''), 'General'),
    'transfer_group_id', source.metadata->>'transfer_group_id',
    'transfer_direction', 'credit',
    'counter_account_id', source.account_id::text,
    'counter_account_amount_type', coalesce(nullif(source.metadata->>'account_amount_type', ''), 'General')
  )),
  source.deleted_at,
  source.created_at + interval '1 millisecond',
  now()
from public.transactions as source
where lower(source.type) = 'transfer'
  and source.transfer_account_id is not null
  and source.metadata->>'transfer_direction' = 'debit'
  and source.metadata->>'transfer_group_id' = source.id::text
  and not exists (
    select 1
    from public.transactions as credit
    where credit.user_id = source.user_id
      and credit.metadata->>'transfer_group_id' = source.metadata->>'transfer_group_id'
      and credit.metadata->>'transfer_direction' = 'credit'
  );
