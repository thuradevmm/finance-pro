alter table if exists public.transactions
add column if not exists metadata jsonb not null default '{}'::jsonb;
