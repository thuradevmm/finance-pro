-- Make every active savings goal own one amount type on its selected account.
-- Savings capital is represented by linked paired transfers, never by a
-- progress-only manual number.

-- Active goals on one account need distinct bucket names. Preserve duplicate
-- legacy rows by giving later records deterministic suffixes.
update public.savings_goals
set name = 'Savings Goal ' || left(id::text, 8),
    updated_at = now()
where deleted_at is null
  and btrim(coalesce(name, '')) = '';

with ranked_goals as (
  select
    goal.id,
    row_number() over (
      partition by goal.user_id, goal.account_id, lower(btrim(goal.name))
      order by goal.created_at, goal.id
    ) as duplicate_number
  from public.savings_goals as goal
  where goal.deleted_at is null
)
update public.savings_goals as goal
set name = left(btrim(goal.name), 68) || ' (' || left(goal.id::text, 8) || ')',
    updated_at = now()
from ranked_goals
where ranked_goals.id = goal.id
  and ranked_goals.duplicate_number > 1;

-- Do not silently claim an unrelated existing bucket. When the legacy goal
-- selected a different bucket, retain both by making the goal name unique.
update public.savings_goals as goal
set name = left(btrim(goal.name), 68) || ' (' || left(goal.id::text, 8) || ')',
    updated_at = now()
from public.accounts as account
where goal.account_id = account.id
  and goal.user_id = account.user_id
  and goal.deleted_at is null
  and lower(btrim(coalesce(goal.account_amount_type, 'General'))) <> lower(btrim(goal.name))
  and exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
        then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types' else '[]'::jsonb end
    ) as amount_type(item)
    where lower(btrim(amount_type.item ->> 'type')) = lower(btrim(goal.name))
  );

create unique index if not exists savings_goals_account_name_active_idx
  on public.savings_goals (user_id, account_id, lower(btrim(name)))
  where deleted_at is null;

-- Retain the former bucket as the source for the opening-capital alignment.
update public.savings_goals
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_account_amount_type', coalesce(nullif(btrim(account_amount_type), ''), 'Operation'),
      'savings_amount_type_managed', true,
      'savings_amount_type_version', 1
    ),
    account_amount_type = btrim(name),
    updated_at = now()
where deleted_at is null;

-- Add or claim the goal-owned bucket while preserving every existing bucket.
with goal_types as (
  select
    goal.account_id,
    jsonb_agg(
      jsonb_build_object(
        'type', goal.name,
        'amountValue', 0,
        'savings_goal_id', goal.id,
        'managed_by', 'savings_goal'
      ) order by goal.created_at, goal.id
    ) as items
  from public.savings_goals as goal
  where goal.deleted_at is null
    and goal.account_id is not null
  group by goal.account_id
), rebuilt as (
  select
    account.id,
    coalesce(
      (
        select jsonb_agg(existing.item order by existing.position)
        from jsonb_array_elements(
          case
            when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
              then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types'
            else '[]'::jsonb
          end
        ) with ordinality as existing(item, position)
        where not exists (
          select 1
          from jsonb_array_elements(goal_types.items) as managed(item)
          where lower(btrim(managed.item ->> 'type')) = lower(btrim(existing.item ->> 'type'))
        )
      ),
      '[]'::jsonb
    ) || goal_types.items as amount_types
  from public.accounts as account
  join goal_types on goal_types.account_id = account.id
)
update public.accounts as account
set metadata = coalesce(account.metadata, '{}'::jsonb) || jsonb_build_object('amount_types', rebuilt.amount_types),
    updated_at = now()
from rebuilt
where rebuilt.id = account.id;

insert into public.account_amount_types (user_id, name, is_active, deleted_at, metadata)
select distinct on (goal.user_id, lower(btrim(goal.name)))
  goal.user_id,
  btrim(goal.name),
  true,
  null,
  jsonb_build_object('source', 'savings_goal', 'managed_by', 'savings_goal')
from public.savings_goals as goal
where goal.deleted_at is null
order by goal.user_id, lower(btrim(goal.name)), goal.created_at, goal.id
on conflict (user_id, normalized_name)
do update set is_active = true,
              deleted_at = null,
              metadata = coalesce(public.account_amount_types.metadata, '{}'::jsonb)
                || jsonb_build_object('source', 'savings_goal', 'managed_by', 'savings_goal');

-- Move linked legacy activity onto its now-owned bucket. Both halves of a
-- transfer are updated according to which endpoint is the goal account.
update public.transactions as transaction
set metadata = coalesce(transaction.metadata, '{}'::jsonb)
      || case
        when transaction.account_id = goal.account_id
          and lower(btrim(coalesce(transaction.metadata ->> 'account_amount_type', 'General')))
            = lower(btrim(coalesce(goal.metadata ->> 'legacy_account_amount_type', 'General')))
          then jsonb_build_object('account_amount_type', goal.name)
        else '{}'::jsonb
      end
      || case
        when transaction.transfer_account_id = goal.account_id
          and lower(btrim(coalesce(transaction.metadata ->> 'transfer_account_amount_type', transaction.metadata ->> 'account_amount_type', 'General')))
            = lower(btrim(coalesce(goal.metadata ->> 'legacy_account_amount_type', 'General')))
          then jsonb_build_object(
            'transfer_account_amount_type', goal.name,
            'counter_account_amount_type', goal.name
          )
        else '{}'::jsonb
      end
      || jsonb_build_object('savings_amount_type_version', 1),
    updated_at = now()
from public.savings_goals as goal
where transaction.user_id in (goal.user_id)
  and transaction.related_entity_type = 'savings_goal'
  and transaction.related_entity_id = goal.id
  and transaction.deleted_at is null
  and goal.deleted_at is null;

-- Convert legacy stored progress into real same-account transfers. Exchange
-- rates convert the base-currency saved value back to the account currency;
-- a missing legacy rate is explicitly marked and conservatively uses 1:1.
with legacy_openings as (
  select
    goal.id as goal_id,
    goal.user_id,
    goal.account_id,
    goal.name as destination_type,
    coalesce(nullif(btrim(goal.metadata ->> 'legacy_account_amount_type'), ''), 'Operation') as legacy_source_type,
    greatest(
      coalesce(goal.saved_amount, 0),
      coalesce(goal.initial_saved_amount, 0),
      coalesce(goal.current_amount, 0),
      0
    ) as base_amount,
    coalesce(goal.created_at::date, current_date) as transaction_date,
    coalesce(account.currency_code, 'MMK') as account_currency,
    coalesce(setting.currency_code, 'MMK') as base_currency,
    rate.rate_to_base
  from public.savings_goals as goal
  join public.accounts as account on account.id = goal.account_id and account.user_id = goal.user_id
  left join public.user_settings as setting on setting.user_id = goal.user_id
  left join lateral (
    select exchange.rate_to_base
    from public.currency_exchange_rates as exchange
    where exchange.user_id = goal.user_id
      and exchange.currency_code = account.currency_code
      and exchange.effective_date <= coalesce(goal.created_at::date, current_date)
    order by exchange.effective_date desc
    limit 1
  ) as rate on true
  where goal.deleted_at is null
), prepared as (
  select
    legacy_openings.*,
    case
      when lower(legacy_source_type) <> lower(destination_type) then legacy_source_type
      else 'Operation'
    end as source_type,
    case
      when account_currency = base_currency then base_amount
      when rate_to_base > 0 then round(base_amount / rate_to_base, 2)
      else base_amount
    end as native_amount,
    gen_random_uuid() as transfer_group_id
  from legacy_openings
  where base_amount > 0
), accounts_needing_operation as (
  select distinct prepared.account_id
  from prepared
  where prepared.source_type = 'Operation'
)
update public.accounts as account
set metadata = coalesce(account.metadata, '{}'::jsonb) || jsonb_build_object(
      'amount_types', case
        when exists (
          select 1
          from jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
                then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types'
              else '[]'::jsonb
            end
          ) as amount_type(item)
          where lower(btrim(amount_type.item ->> 'type')) = 'operation'
        ) then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types'
        else coalesce(account.metadata, '{}'::jsonb) -> 'amount_types'
          || jsonb_build_array(jsonb_build_object('type', 'Operation', 'amountValue', 0))
      end
    ),
    updated_at = now()
from accounts_needing_operation
where accounts_needing_operation.account_id = account.id;

with legacy_openings as (
  select
    goal.id as goal_id,
    goal.user_id,
    goal.account_id,
    goal.name as destination_type,
    case
      when lower(coalesce(nullif(btrim(goal.metadata ->> 'legacy_account_amount_type'), ''), 'Operation')) <> lower(goal.name)
        then coalesce(nullif(btrim(goal.metadata ->> 'legacy_account_amount_type'), ''), 'Operation')
      else 'Operation'
    end as source_type,
    greatest(
      coalesce(goal.saved_amount, 0),
      coalesce(goal.initial_saved_amount, 0),
      coalesce(goal.current_amount, 0),
      0
    ) as base_amount,
    coalesce(goal.created_at::date, current_date) as transaction_date,
    coalesce(account.currency_code, 'MMK') as account_currency,
    coalesce(setting.currency_code, 'MMK') as base_currency,
    rate.rate_to_base,
    gen_random_uuid() as transfer_group_id
  from public.savings_goals as goal
  join public.accounts as account on account.id = goal.account_id and account.user_id = goal.user_id
  left join public.user_settings as setting on setting.user_id = goal.user_id
  left join lateral (
    select exchange.rate_to_base
    from public.currency_exchange_rates as exchange
    where exchange.user_id = goal.user_id
      and exchange.currency_code = account.currency_code
      and exchange.effective_date <= coalesce(goal.created_at::date, current_date)
    order by exchange.effective_date desc
    limit 1
  ) as rate on true
  where goal.deleted_at is null
), prepared as (
  select *, case
    when account_currency = base_currency then base_amount
    when rate_to_base > 0 then round(base_amount / rate_to_base, 2)
    else base_amount
  end as native_amount
  from legacy_openings
  where base_amount > 0
), inserted_debits as (
  insert into public.transactions (
    user_id, transaction_date, type, amount, account_id, transfer_account_id,
    category_id, status, title, description, note,
    related_entity_type, related_entity_id, metadata, created_at, updated_at
  )
  select
    prepared.user_id,
    prepared.transaction_date,
    'transfer',
    prepared.native_amount,
    prepared.account_id,
    prepared.account_id,
    null,
    'cleared',
    'Legacy savings capital alignment',
    'Converted opening savings into a goal-owned capital transfer.',
    'Legacy savings capital alignment',
    'savings_goal',
    prepared.goal_id,
    jsonb_build_object(
      'account_amount_type', prepared.source_type,
      'transfer_account_amount_type', prepared.destination_type,
      'counter_account_amount_type', prepared.destination_type,
      'counter_account_id', prepared.account_id,
      'transfer_group_id', prepared.transfer_group_id,
      'transfer_direction', 'debit',
      'savings_action', 'deposit',
      'accounting_class', 'transfer',
      'accounting_version', 1,
      'financial_event', 'legacy_savings_capital_alignment',
      'legacy_base_amount', prepared.base_amount,
      'legacy_exchange_rate_missing', prepared.account_currency <> prepared.base_currency and prepared.rate_to_base is null
    ),
    prepared.transaction_date::timestamptz,
    now()
  from prepared
  returning related_entity_id, metadata
)
insert into public.transactions (
  user_id, transaction_date, type, amount, account_id, transfer_account_id,
  category_id, status, title, description, note,
  related_entity_type, related_entity_id, metadata, created_at, updated_at
)
select
  prepared.user_id,
  prepared.transaction_date,
  'transfer',
  prepared.native_amount,
  prepared.account_id,
  prepared.account_id,
  null,
  'cleared',
  'Legacy savings capital alignment',
  'Converted opening savings into a goal-owned capital transfer.',
  'Legacy savings capital alignment',
  'savings_goal',
  prepared.goal_id,
  jsonb_build_object(
    'account_amount_type', prepared.destination_type,
    'transfer_account_amount_type', prepared.source_type,
    'counter_account_amount_type', prepared.source_type,
    'counter_account_id', prepared.account_id,
    'transfer_group_id', prepared.transfer_group_id,
    'transfer_direction', 'credit',
    'savings_action', 'deposit',
    'accounting_class', 'transfer',
    'accounting_version', 1,
    'financial_event', 'legacy_savings_capital_alignment',
    'legacy_base_amount', prepared.base_amount,
    'legacy_exchange_rate_missing', prepared.account_currency <> prepared.base_currency and prepared.rate_to_base is null
  ),
  prepared.transaction_date::timestamptz + interval '1 millisecond',
  now()
from prepared
join inserted_debits on inserted_debits.related_entity_id = prepared.goal_id
  and inserted_debits.metadata ->> 'transfer_group_id' = prepared.transfer_group_id::text;

update public.savings_goals
set initial_saved_amount = 0,
    current_amount = 0,
    saved_amount = 0,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'current_amount', 0,
      'saved_amount', 0,
      'opening_savings_migrated_to_ledger', true,
      'opening_savings_migrated_at', now()
    ),
    updated_at = now()
where deleted_at is null
  and (
    coalesce(saved_amount, 0) <> 0
    or coalesce(initial_saved_amount, 0) <> 0
    or coalesce(current_amount, 0) <> 0
  );

create or replace function public.sync_savings_goal_amount_type()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_new_name text := btrim(new.name);
  v_old_name text := case when tg_op = 'UPDATE' then btrim(old.account_amount_type) else null end;
  v_account public.accounts%rowtype;
  v_amount_types jsonb;
begin
  if new.deleted_at is not null then
    if tg_op = 'UPDATE' and old.deleted_at is null and old.account_id is not null then
      update public.accounts as account
      set metadata = coalesce(account.metadata, '{}'::jsonb) || jsonb_build_object(
        'amount_types', coalesce((
          select jsonb_agg(amount_type.item order by amount_type.position)
          from jsonb_array_elements(
            case when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
              then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types' else '[]'::jsonb end
          ) with ordinality as amount_type(item, position)
          where coalesce(amount_type.item ->> 'savings_goal_id', '') <> old.id::text
        ), '[]'::jsonb)
      ), updated_at = now()
      where account.id = old.account_id and account.user_id = old.user_id;
    end if;
    return new;
  end if;
  if new.account_id is null then
    raise exception 'savings_goal_amount_type_requires_account';
  end if;
  if char_length(v_new_name) < 1 or char_length(v_new_name) > 80 then
    raise exception 'savings_goal_amount_type_invalid_name';
  end if;

  if tg_op = 'UPDATE' and old.account_id is distinct from new.account_id and exists (
    select 1 from public.transactions as transaction
    where transaction.user_id in (new.user_id)
      and transaction.related_entity_type = 'savings_goal'
      and transaction.related_entity_id = new.id
      and transaction.deleted_at is null
  ) then
    raise exception 'savings_goal_amount_type_account_has_history';
  end if;

  select * into v_account
  from public.accounts as account
  where account.id = new.account_id
    and account.user_id = new.user_id
    and account.deleted_at is null
  for update;
  if not found then
    raise exception 'savings_goal_amount_type_account_missing';
  end if;

  v_amount_types := case
    when jsonb_typeof(coalesce(v_account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
      then coalesce(v_account.metadata, '{}'::jsonb) -> 'amount_types'
    else '[]'::jsonb
  end;

  if exists (
    select 1 from jsonb_array_elements(v_amount_types) as amount_type(item)
    where lower(btrim(amount_type.item ->> 'type')) = lower(v_new_name)
      and coalesce(amount_type.item ->> 'savings_goal_id', '') <> new.id::text
  ) then
    raise exception 'savings_goal_amount_type_name_conflict';
  end if;

  select coalesce(jsonb_agg(amount_type.item order by amount_type.position), '[]'::jsonb)
    into v_amount_types
  from jsonb_array_elements(v_amount_types) with ordinality as amount_type(item, position)
  where coalesce(amount_type.item ->> 'savings_goal_id', '') <> new.id::text;
  v_amount_types := v_amount_types || jsonb_build_array(jsonb_build_object(
    'type', v_new_name,
    'amountValue', 0,
    'savings_goal_id', new.id,
    'managed_by', 'savings_goal'
  ));

  update public.accounts
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('amount_types', v_amount_types),
      updated_at = now()
  where id = new.account_id and user_id = new.user_id;

  if tg_op = 'UPDATE' and (old.account_id is distinct from new.account_id or lower(v_old_name) <> lower(v_new_name)) then
    update public.transactions as transaction
    set metadata = coalesce(transaction.metadata, '{}'::jsonb)
          || case
            when transaction.account_id = old.account_id
              and lower(btrim(coalesce(transaction.metadata ->> 'account_amount_type', 'General'))) = lower(v_old_name)
              then jsonb_build_object('account_amount_type', v_new_name)
            else '{}'::jsonb
          end
          || case
            when transaction.transfer_account_id = old.account_id
              and lower(btrim(coalesce(transaction.metadata ->> 'transfer_account_amount_type', transaction.metadata ->> 'account_amount_type', 'General'))) = lower(v_old_name)
              then jsonb_build_object('transfer_account_amount_type', v_new_name, 'counter_account_amount_type', v_new_name)
            else '{}'::jsonb
          end
          || jsonb_build_object('savings_amount_type_renamed_at', now()),
        updated_at = now()
    where transaction.user_id in (new.user_id)
      and transaction.related_entity_type = 'savings_goal'
      and transaction.related_entity_id = new.id
      and transaction.deleted_at is null;

    if old.account_id is distinct from new.account_id then
      update public.accounts as account
      set metadata = coalesce(account.metadata, '{}'::jsonb) || jsonb_build_object(
        'amount_types', coalesce((
          select jsonb_agg(amount_type.item order by amount_type.position)
          from jsonb_array_elements(
            case when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
              then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types' else '[]'::jsonb end
          ) with ordinality as amount_type(item, position)
          where coalesce(amount_type.item ->> 'savings_goal_id', '') <> new.id::text
        ), '[]'::jsonb)
      ), updated_at = now()
      where account.id = old.account_id and account.user_id = new.user_id;
    end if;
  end if;

  insert into public.account_amount_types (user_id, name, is_active, deleted_at, metadata)
  values (new.user_id, v_new_name, true, null, jsonb_build_object('source', 'savings_goal', 'managed_by', 'savings_goal'))
  on conflict (user_id, normalized_name)
  do update set is_active = true, deleted_at = null,
                metadata = coalesce(public.account_amount_types.metadata, '{}'::jsonb)
                  || jsonb_build_object('source', 'savings_goal', 'managed_by', 'savings_goal');

  new.account_amount_type := v_new_name;
  new.initial_saved_amount := 0;
  new.current_amount := 0;
  new.saved_amount := 0;
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'account_id', new.account_id,
    'account_amount_type', v_new_name,
    'current_amount', 0,
    'saved_amount', 0,
    'savings_amount_type_managed', true,
    'savings_amount_type_version', 1
  );
  return new;
end;
$$;

drop trigger if exists sync_savings_goal_amount_type on public.savings_goals;
create trigger sync_savings_goal_amount_type
  before insert or update of name, account_id, deleted_at on public.savings_goals
  for each row execute function public.sync_savings_goal_amount_type();

comment on function public.sync_savings_goal_amount_type() is
  'Keeps each active savings goal synchronized with one goal-owned account amount type and blocks account moves after ledger history exists.';
