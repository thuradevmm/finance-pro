-- Idempotent external transaction identities and user-owned exchange rates.

create table if not exists public.transaction_sync_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  source text not null,
  external_id text not null,
  transaction_group_id uuid not null,
  payload_hash text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transaction_sync_identity_source_check check (length(trim(source)) between 1 and 100),
  constraint transaction_sync_identity_external_id_check check (length(trim(external_id)) between 1 and 250),
  constraint transaction_sync_identity_hash_check check (payload_hash ~ '^[0-9a-f]{64}$'),
  unique (user_id, source, external_id)
);

create index if not exists transaction_sync_identities_group_idx
  on public.transaction_sync_identities (user_id, transaction_group_id);

create table if not exists public.currency_exchange_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  currency_code text not null,
  rate_to_base numeric(24, 8) not null,
  effective_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currency_exchange_rates_code_check check (currency_code ~ '^[A-Z]{3}$'),
  constraint currency_exchange_rates_positive_check check (rate_to_base > 0),
  unique (user_id, currency_code, effective_date)
);

create index if not exists currency_exchange_rates_lookup_idx
  on public.currency_exchange_rates (user_id, currency_code, effective_date desc);

drop trigger if exists set_updated_at on public.transaction_sync_identities;
create trigger set_updated_at before update on public.transaction_sync_identities
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_updated_at on public.currency_exchange_rates;
create trigger set_updated_at before update on public.currency_exchange_rates
  for each row execute procedure public.set_updated_at();

alter table public.transaction_sync_identities enable row level security;
alter table public.transaction_sync_identities force row level security;
drop policy if exists owner_access on public.transaction_sync_identities;
create policy owner_access on public.transaction_sync_identities for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.currency_exchange_rates enable row level security;
alter table public.currency_exchange_rates force row level security;
drop policy if exists owner_access on public.currency_exchange_rates;
create policy owner_access on public.currency_exchange_rates for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.transaction_sync_identities to authenticated;
grant select, insert, update, delete on public.currency_exchange_rates to authenticated;

comment on table public.transaction_sync_identities is
  'Permanent idempotency registry for imported and externally synchronized transactions, including records later archived by the user.';
comment on table public.currency_exchange_rates is
  'User-owned historical conversion rates expressed as units of the configured base currency per one unit of currency_code.';
