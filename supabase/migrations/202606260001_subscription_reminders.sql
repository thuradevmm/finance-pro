alter table if exists public.subscriptions
  add column if not exists reminder_enabled boolean not null default true,
  add column if not exists reminder_days_before integer not null default 3,
  add column if not exists last_reminded_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_reminder_days_before_check'
      and conrelid = 'public.subscriptions'::regclass
  ) then
    alter table public.subscriptions
      add constraint subscriptions_reminder_days_before_check
      check (reminder_days_before between 0 and 30)
      not valid;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'subscriptions_reminder_days_before_check'
      and conrelid = 'public.subscriptions'::regclass
      and not convalidated
  ) then
    alter table public.subscriptions validate constraint subscriptions_reminder_days_before_check;
  end if;
end $$;
