-- PostgreSQL uses different word-boundary semantics from JavaScript. Repeat
-- the idempotent legacy lending upgrade with an explicit whitespace/end check.
update public.debts
set
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('debt_nature', 'lending'),
  updated_at = now()
where deleted_at is null
  and coalesce(metadata->>'debt_nature', '') = ''
  and name ~* '^\s*lend(ing|t)?(\s|$)';
