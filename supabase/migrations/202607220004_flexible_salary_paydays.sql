-- Add optional month-specific payday corrections without rewriting salary
-- settings, categories, or historical transactions. The recurring payday rule
-- remains in user_settings.settings so older application versions continue to
-- use their fixed salary_period_start_day safely.

create table if not exists public.salary_payday_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  salary_month date not null,
  payday date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint salary_payday_overrides_month_start_check
    check (extract(day from salary_month) = 1),
  constraint salary_payday_overrides_user_month_key
    unique (user_id, salary_month)
);

create index if not exists salary_payday_overrides_user_payday_idx
  on public.salary_payday_overrides (user_id, payday);

drop trigger if exists set_updated_at on public.salary_payday_overrides;
create trigger set_updated_at
  before update on public.salary_payday_overrides
  for each row execute procedure public.set_updated_at();

alter table public.salary_payday_overrides enable row level security;
alter table public.salary_payday_overrides force row level security;
drop policy if exists owner_access on public.salary_payday_overrides;
create policy owner_access on public.salary_payday_overrides
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.salary_payday_overrides to authenticated;
