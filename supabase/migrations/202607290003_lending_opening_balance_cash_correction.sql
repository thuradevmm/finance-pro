-- Lending debt setup uses payment_account_id as the account where future
-- returns are received. The previous origination backfill incorrectly treated
-- that field as proof that the same account funded the historical loan.
--
-- Preserve the generated rows for audit through soft deletion while removing
-- their fabricated cash effects. Manual transactions and borrowing receipts
-- are deliberately outside this tightly constrained correction.

-- @allow-destructive-migration: reviewed soft deletion of inferred system rows; original records remain recoverable for audit
-- @allow-financial-data-loss: corrects fabricated lending cash outflows only; no user-entered financial row is targeted
update public.transactions as txn
set
  deleted_at = coalesce(txn.deleted_at, now()),
  metadata = coalesce(txn.metadata, '{}'::jsonb) || jsonb_build_object(
    'cash_flow_treatment', 'opening_receivable',
    'correction_reason', 'Payment account did not establish a historical lending funding source'
  )
where txn.deleted_at is null
  and lower(txn.type) = 'expense'
  and txn.related_entity_type = 'debt'
  and lower(coalesce(txn.metadata->>'system_managed', 'false')) = 'true'
  and lower(coalesce(txn.metadata->>'financial_event', '')) = 'debt_origination'
  and lower(coalesce(txn.metadata->>'debt_nature', '')) = 'lending';

comment on table public.transactions is
  'Financial events including operating activity, transfers, financing principal movements, and system-managed borrowing originations. Inferred lending openings without an explicit funding source remain soft-deleted audit records.';
