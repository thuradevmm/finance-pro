-- Add a non-destructive lifecycle to transaction-linked modules. `deleted_at`
-- remains reserved for records that have never acquired financial or dependent
-- history; used records are retained and deactivated with `is_active` instead.

alter table public.assets
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

alter table public.debts
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

alter table public.savings_goals
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

alter table public.subscriptions
  add column if not exists is_active boolean not null default true,
  add column if not exists archived_at timestamptz;

-- Preserve legacy lifecycle intent without touching transaction visibility or
-- rewriting any financial event. Archived assets and paused/ended subscriptions are
-- inactive workflow records even when an older application did not store a
-- dedicated lifecycle flag.
update public.assets
set is_active = false,
    archived_at = coalesce(archived_at, deleted_at, updated_at, created_at, now())
where is_active = false
   or deleted_at is not null
   or lower(btrim(coalesce(status, metadata ->> 'status', ''))) = 'archived'
   or lower(btrim(coalesce(metadata ->> 'is_active', ''))) = 'false'
   or lower(btrim(coalesce(metadata ->> 'lifecycle_status', ''))) in ('archived', 'deactivated', 'inactive');

update public.debts
set is_active = false,
    archived_at = coalesce(archived_at, deleted_at, updated_at, created_at, now())
where is_active = false
   or deleted_at is not null
   or lower(btrim(coalesce(status, metadata ->> 'status', ''))) in ('archived', 'cancelled', 'canceled')
   or lower(btrim(coalesce(metadata ->> 'is_active', ''))) = 'false'
   or lower(btrim(coalesce(metadata ->> 'lifecycle_status', ''))) in ('archived', 'deactivated', 'inactive');

update public.savings_goals
set is_active = false,
    archived_at = coalesce(archived_at, deleted_at, updated_at, created_at, now())
where is_active = false
   or deleted_at is not null
   or lower(btrim(coalesce(status, metadata ->> 'status', ''))) = 'archived'
   or lower(btrim(coalesce(metadata ->> 'is_active', ''))) = 'false'
   or lower(btrim(coalesce(metadata ->> 'lifecycle_status', ''))) in ('archived', 'deactivated', 'inactive');

update public.subscriptions
set is_active = false,
    archived_at = coalesce(archived_at, deleted_at, updated_at, created_at, now())
where is_active = false
   or deleted_at is not null
   or lower(btrim(coalesce(status, metadata ->> 'status', ''))) in ('archived', 'paused', 'expired', 'cancelled', 'canceled')
   or lower(btrim(coalesce(metadata ->> 'is_active', ''))) = 'false'
   or lower(btrim(coalesce(metadata ->> 'lifecycle_status', ''))) in ('archived', 'deactivated', 'inactive');

-- Older application versions could tombstone a record before the complete
-- usage guards existed. Recover only tombstones that already have financial or
-- dependent evidence. Unused tombstones stay deleted. Used accounts return as
-- Needs Review and active so their ledger position immediately contributes to
-- reconciliation; used module records return as inactive/archived workflow
-- records while retaining their business status and financial position.
update public.accounts as account
set deleted_at = null,
    is_active = true,
    metadata = coalesce(account.metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_at', null,
      'is_active', true,
      'lifecycle_status', 'active',
      'recovered_at', now(),
      'recovery_reason', 'used_legacy_tombstone',
      'status', 'Needs Review'
    )
where account.deleted_at is not null
  and (
    exists (
      select 1 from public.transactions as txn
      where txn.user_id = account.user_id
        and (
          txn.account_id = account.id
          or txn.transfer_account_id = account.id
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'credit_card_account_id' = account.id::text
        )
    )
    or exists (
      select 1 from public.assets as asset
      where asset.user_id = account.user_id and asset.account_id = account.id
    )
    or exists (
      select 1 from public.debts as debt
      where debt.user_id = account.user_id
        and (
          debt.account_id = account.id
          or debt.payment_account_id = account.id
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'credit_card_account_id' = account.id::text
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'auto_credit_card_account_id' = account.id::text
        )
    )
    or exists (
      select 1 from public.savings_goals as goal
      where goal.user_id = account.user_id and goal.account_id = account.id
    )
    or exists (
      select 1 from public.subscriptions as subscription
      where subscription.user_id = account.user_id and subscription.account_id = account.id
    )
    or exists (
      select 1 from public.scenario_items as item
      where item.user_id = account.user_id and item.account_id = account.id
    )
  );

update public.assets as asset
set deleted_at = null,
    metadata = coalesce(asset.metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_at', asset.archived_at,
      'is_active', false,
      'lifecycle_status', 'archived',
      'recovered_at', now(),
      'recovery_reason', 'used_legacy_tombstone'
    )
where asset.deleted_at is not null
  and (
    asset.transaction_id is not null
    or abs(coalesce(asset.purchase_amount, 0)) > 0.005
    or abs(coalesce(asset.current_value, 0)) > 0.005
    or (jsonb_typeof(coalesce(asset.metadata, '{}'::jsonb) -> 'purchase_amount') = 'number'
      and abs((asset.metadata ->> 'purchase_amount')::numeric) > 0.005)
    or (jsonb_typeof(coalesce(asset.metadata, '{}'::jsonb) -> 'current_value') = 'number'
      and abs((asset.metadata ->> 'current_value')::numeric) > 0.005)
    or exists (
      select 1 from public.transactions as txn
      where txn.user_id = asset.user_id
        and (
          (
            regexp_replace(lower(btrim(coalesce(txn.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('asset', 'assets')
            and txn.related_entity_id = asset.id
          )
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'asset_id' = asset.id::text
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'linked_asset_id' = asset.id::text
          or (
            regexp_replace(lower(btrim(coalesce(txn.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g') = 'asset'
            and txn.metadata ->> 'secondary_related_entity_id' = asset.id::text
          )
        )
    )
    or exists (
      select 1 from public.asset_history_events as event
      where event.user_id = asset.user_id and event.asset_id = asset.id
    )
    or exists (
      select 1 from public.file_links as link
      where link.user_id = asset.user_id
        and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('asset', 'assets')
        and link.entity_id = asset.id
    )
  );

update public.debts as debt
set deleted_at = null,
    metadata = coalesce(debt.metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_at', debt.archived_at,
      'is_active', false,
      'lifecycle_status', 'archived',
      'recovered_at', now(),
      'recovery_reason', 'used_legacy_tombstone'
    )
where debt.deleted_at is not null
  and (
    (abs(coalesce(debt.total_amount, 0)) > 0.005
      and lower(btrim(coalesce(debt.metadata ->> 'origination_state', ''))) <> 'pending')
    or abs(coalesce(debt.repaid_amount, 0)) > 0.005
    or abs(coalesce(debt.initial_paid_amount, 0)) > 0.005
    or (jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb) -> 'total_amount') = 'number'
      and abs((debt.metadata ->> 'total_amount')::numeric) > 0.005
      and lower(btrim(coalesce(debt.metadata ->> 'origination_state', ''))) <> 'pending')
    or (jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb) -> 'repaid_amount') = 'number'
      and abs((debt.metadata ->> 'repaid_amount')::numeric) > 0.005)
    or (jsonb_typeof(coalesce(debt.metadata, '{}'::jsonb) -> 'principal_paid') = 'number'
      and abs((debt.metadata ->> 'principal_paid')::numeric) > 0.005)
    or exists (
      select 1 from public.transactions as txn
      where txn.user_id = debt.user_id
        and (
          (
            regexp_replace(lower(btrim(coalesce(txn.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('debt', 'debts')
            and txn.related_entity_id = debt.id
          )
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'debt_id' = debt.id::text
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'linked_debt_id' = debt.id::text
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'credit_card_debt_id' = debt.id::text
          or (
            regexp_replace(lower(btrim(coalesce(txn.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g') = 'debt'
            and txn.metadata ->> 'secondary_related_entity_id' = debt.id::text
          )
        )
    )
    or exists (
      select 1 from public.debt_payments as payment
      where payment.user_id = debt.user_id and payment.debt_id = debt.id
    )
    or exists (
      select 1 from public.file_links as link
      where link.user_id = debt.user_id
        and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('debt', 'debts')
        and link.entity_id = debt.id
    )
  );

-- Clearing deleted_at invokes the existing savings amount-type synchronizer,
-- which correctly restores the goal-owned account amount type but normalizes
-- stored capital fields to zero. Capture and restore those fields immediately
-- so this repair never rewrites historical financial evidence.
do $$
declare
  v_goal record;
begin
  for v_goal in
    select goal.*
    from public.savings_goals as goal
    where goal.deleted_at is not null
      and (
        abs(coalesce(goal.initial_saved_amount, 0)) > 0.005
        or abs(coalesce(goal.current_amount, 0)) > 0.005
        or abs(coalesce(goal.saved_amount, 0)) > 0.005
        or (jsonb_typeof(coalesce(goal.metadata, '{}'::jsonb) -> 'current_amount') = 'number'
          and abs((goal.metadata ->> 'current_amount')::numeric) > 0.005)
        or (jsonb_typeof(coalesce(goal.metadata, '{}'::jsonb) -> 'saved_amount') = 'number'
          and abs((goal.metadata ->> 'saved_amount')::numeric) > 0.005)
        or nullif(coalesce(goal.metadata, '{}'::jsonb) ->> 'last_transaction_id', '') is not null
        or exists (
          select 1 from public.transactions as txn
          where txn.user_id = goal.user_id
            and (
              (
                regexp_replace(lower(btrim(coalesce(txn.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('savings_goal', 'savings_goals')
                and txn.related_entity_id = goal.id
              )
              or coalesce(txn.metadata, '{}'::jsonb) ->> 'savings_goal_id' = goal.id::text
              or coalesce(txn.metadata, '{}'::jsonb) ->> 'linked_savings_goal_id' = goal.id::text
              or (
                regexp_replace(lower(btrim(coalesce(txn.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g') = 'savings_goal'
                and txn.metadata ->> 'secondary_related_entity_id' = goal.id::text
              )
            )
        )
        or exists (
          select 1 from public.savings_goal_entries as entry
          where entry.user_id = goal.user_id and entry.savings_goal_id = goal.id
        )
        or exists (
          select 1 from public.file_links as link
          where link.user_id = goal.user_id
            and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('savings_goal', 'savings_goals')
            and link.entity_id = goal.id
        )
      )
  loop
    update public.savings_goals
    set deleted_at = null
    where id = v_goal.id and user_id = v_goal.user_id;

    update public.savings_goals
    set initial_saved_amount = v_goal.initial_saved_amount,
        current_amount = v_goal.current_amount,
        saved_amount = v_goal.saved_amount,
        metadata = coalesce(v_goal.metadata, '{}'::jsonb) || jsonb_build_object(
          'archived_at', v_goal.archived_at,
          'is_active', false,
          'lifecycle_status', 'archived',
          'recovered_at', now(),
          'recovery_reason', 'used_legacy_tombstone'
        )
    where id = v_goal.id and user_id = v_goal.user_id;
  end loop;
end;
$$;

update public.subscriptions as subscription
set deleted_at = null,
    metadata = coalesce(subscription.metadata, '{}'::jsonb) || jsonb_build_object(
      'archived_at', subscription.archived_at,
      'is_active', false,
      'lifecycle_status', 'archived',
      'recovered_at', now(),
      'recovery_reason', 'used_legacy_tombstone'
    )
where subscription.deleted_at is not null
  and (
    exists (
      select 1 from public.transactions as txn
      where txn.user_id = subscription.user_id
        and (
          (
            regexp_replace(lower(btrim(coalesce(txn.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('subscription', 'subscriptions')
            and txn.related_entity_id = subscription.id
          )
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'subscription_id' = subscription.id::text
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'linked_subscription_id' = subscription.id::text
          or (
            regexp_replace(lower(btrim(coalesce(txn.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g') = 'subscription'
            and txn.metadata ->> 'secondary_related_entity_id' = subscription.id::text
          )
        )
    )
    or exists (
      select 1 from public.subscription_payments as payment
      where payment.user_id = subscription.user_id and payment.subscription_id = subscription.id
    )
    or exists (
      select 1 from public.file_links as link
      where link.user_id = subscription.user_id
        and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('subscription', 'subscriptions')
        and link.entity_id = subscription.id
    )
    or nullif(coalesce(subscription.metadata, '{}'::jsonb) ->> 'last_payment_transaction_id', '') is not null
    or nullif(coalesce(subscription.metadata, '{}'::jsonb) ->> 'last_payment_date', '') is not null
    or nullif(coalesce(subscription.metadata, '{}'::jsonb) ->> 'last_paid_billing_date', '') is not null
    or nullif(coalesce(subscription.metadata, '{}'::jsonb) ->> 'last_subscription_reconciled_at', '') is not null
    or (jsonb_typeof(coalesce(subscription.metadata, '{}'::jsonb) -> 'last_payment_amount') = 'number'
      and abs((subscription.metadata ->> 'last_payment_amount')::numeric) > 0.005)
    or (jsonb_typeof(coalesce(subscription.metadata, '{}'::jsonb) -> 'last_payment_billed_amount') = 'number'
      and abs((subscription.metadata ->> 'last_payment_billed_amount')::numeric) > 0.005)
    or (jsonb_typeof(coalesce(subscription.metadata, '{}'::jsonb) -> 'paid_cycle_count') = 'number'
      and abs((subscription.metadata ->> 'paid_cycle_count')::numeric) > 0.005)
  );

create index if not exists assets_user_lifecycle_idx
  on public.assets (user_id, is_active, created_at desc)
  where deleted_at is null;

create index if not exists debts_user_lifecycle_idx
  on public.debts (user_id, is_active, created_at desc)
  where deleted_at is null;

create index if not exists savings_goals_user_lifecycle_idx
  on public.savings_goals (user_id, is_active, created_at desc)
  where deleted_at is null;

create index if not exists subscriptions_user_lifecycle_idx
  on public.subscriptions (user_id, is_active, created_at desc)
  where deleted_at is null;

create index if not exists transactions_related_entity_history_idx
  on public.transactions (user_id, related_entity_type, related_entity_id);

create index if not exists transactions_credit_card_debt_history_idx
  on public.transactions (user_id, (metadata ->> 'credit_card_debt_id'))
  where metadata ? 'credit_card_debt_id';

create index if not exists asset_history_events_asset_id_idx
  on public.asset_history_events (asset_id);

create index if not exists debt_payments_debt_id_idx
  on public.debt_payments (debt_id);

create index if not exists savings_goal_entries_goal_id_idx
  on public.savings_goal_entries (savings_goal_id);

create index if not exists subscription_payments_subscription_id_idx
  on public.subscription_payments (subscription_id);

-- Guard both physical deletion and the visibility-changing `deleted_at`
-- transition. All transaction rows count as history, including soft-deleted
-- rows, because their identifiers and linked audit evidence must remain
-- resolvable. Deactivation through `is_active` never enters this guard.
create or replace function public.prevent_used_module_record_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entity_type text;
  v_record_label text;
  v_row jsonb := to_jsonb(old);
  v_metadata jsonb := coalesce(old.metadata, '{}'::jsonb);
  v_has_history boolean := false;
  v_primary_amount numeric := 0;
  v_secondary_amount numeric := 0;
  v_tertiary_amount numeric := 0;
  v_origination_pending boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
  end if;

  case tg_table_name
    when 'assets' then
      v_entity_type := 'asset';
      v_record_label := 'asset';
    when 'debts' then
      v_entity_type := 'debt';
      v_record_label := 'Borrowing & Lending record';
    when 'savings_goals' then
      v_entity_type := 'savings_goal';
      v_record_label := 'savings goal or fund';
    when 'subscriptions' then
      v_entity_type := 'subscription';
      v_record_label := 'subscription';
    else
      raise exception 'Unsupported lifecycle table: %', tg_table_name;
  end case;

  select exists (
    select 1
    from public.transactions as txn
    where txn.user_id = old.user_id
      and (
        (
          regexp_replace(lower(btrim(coalesce(txn.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g') in (v_entity_type, v_entity_type || 's')
          and txn.related_entity_id = old.id
        )
        or coalesce(txn.metadata, '{}'::jsonb) ->> (v_entity_type || '_id') = old.id::text
        or coalesce(txn.metadata, '{}'::jsonb) ->> ('linked_' || v_entity_type || '_id') = old.id::text
        or (
          regexp_replace(lower(btrim(coalesce(txn.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g') = v_entity_type
          and txn.metadata ->> 'secondary_related_entity_id' = old.id::text
        )
        or (
          v_entity_type = 'debt'
          and coalesce(txn.metadata, '{}'::jsonb) ->> 'credit_card_debt_id' = old.id::text
        )
      )
  ) into v_has_history;

  if not v_has_history and tg_table_name = 'assets' then
    select exists (
      select 1
      from public.asset_history_events as event
      where event.user_id = old.user_id
        and event.asset_id = old.id
    ) into v_has_history;
  elsif not v_has_history and tg_table_name = 'debts' then
    select exists (
      select 1
      from public.debt_payments as payment
      where payment.user_id = old.user_id
        and payment.debt_id = old.id
    ) into v_has_history;
  elsif not v_has_history and tg_table_name = 'savings_goals' then
    select exists (
      select 1
      from public.savings_goal_entries as entry
      where entry.user_id = old.user_id
        and entry.savings_goal_id = old.id
    ) into v_has_history;
  elsif not v_has_history and tg_table_name = 'subscriptions' then
    select exists (
      select 1
      from public.subscription_payments as payment
      where payment.user_id = old.user_id
        and payment.subscription_id = old.id
    ) into v_has_history;
  end if;

  if not v_has_history then
    select exists (
      select 1
      from public.file_links as link
      where link.user_id = old.user_id
        and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in (v_entity_type, v_entity_type || 's')
        and link.entity_id = old.id
    ) into v_has_history;
  end if;

  -- Legacy records may carry financial evidence directly even when their old
  -- transaction link was never normalized. JSON type checks make this backstop
  -- tolerant of incomplete or non-numeric metadata.
  if not v_has_history and tg_table_name = 'assets' then
    v_primary_amount := case when jsonb_typeof(v_row -> 'purchase_amount') = 'number'
      then abs((v_row ->> 'purchase_amount')::numeric) else 0 end;
    v_secondary_amount := case when jsonb_typeof(v_row -> 'current_value') = 'number'
      then abs((v_row ->> 'current_value')::numeric) else 0 end;
    v_tertiary_amount := greatest(
      case when jsonb_typeof(v_metadata -> 'purchase_amount') = 'number'
        then abs((v_metadata ->> 'purchase_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'current_value') = 'number'
        then abs((v_metadata ->> 'current_value')::numeric) else 0 end
    );
    v_has_history := coalesce(nullif(v_row ->> 'transaction_id', ''), nullif(v_metadata ->> 'transaction_id', '')) is not null
      or greatest(v_primary_amount, v_secondary_amount, v_tertiary_amount) > 0.005;
  elsif not v_has_history and tg_table_name = 'debts' then
    v_primary_amount := greatest(
      case when jsonb_typeof(v_row -> 'repaid_amount') = 'number'
        then abs((v_row ->> 'repaid_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_row -> 'initial_paid_amount') = 'number'
        then abs((v_row ->> 'initial_paid_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'repaid_amount') = 'number'
        then abs((v_metadata ->> 'repaid_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'principal_paid') = 'number'
        then abs((v_metadata ->> 'principal_paid')::numeric) else 0 end
    );
    v_secondary_amount := greatest(
      case when jsonb_typeof(v_row -> 'total_amount') = 'number'
        then abs((v_row ->> 'total_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'total_amount') = 'number'
        then abs((v_metadata ->> 'total_amount')::numeric) else 0 end
    );
    v_origination_pending := lower(btrim(coalesce(v_metadata ->> 'origination_state', ''))) = 'pending';
    v_has_history := v_primary_amount > 0.005
      or (not v_origination_pending and v_secondary_amount > 0.005)
      or coalesce(
        nullif(v_metadata ->> 'last_payment_transaction_id', ''),
        nullif(v_metadata ->> 'origination_transaction_id', '')
      ) is not null;
  elsif not v_has_history and tg_table_name = 'savings_goals' then
    v_primary_amount := greatest(
      case when jsonb_typeof(v_row -> 'initial_saved_amount') = 'number'
        then abs((v_row ->> 'initial_saved_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_row -> 'current_amount') = 'number'
        then abs((v_row ->> 'current_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_row -> 'saved_amount') = 'number'
        then abs((v_row ->> 'saved_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'current_amount') = 'number'
        then abs((v_metadata ->> 'current_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'saved_amount') = 'number'
        then abs((v_metadata ->> 'saved_amount')::numeric) else 0 end
    );
    v_has_history := v_primary_amount > 0.005
      or nullif(v_metadata ->> 'last_transaction_id', '') is not null;
  elsif not v_has_history and tg_table_name = 'subscriptions' then
    v_primary_amount := greatest(
      case when jsonb_typeof(v_metadata -> 'last_payment_amount') = 'number'
        then abs((v_metadata ->> 'last_payment_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'last_payment_billed_amount') = 'number'
        then abs((v_metadata ->> 'last_payment_billed_amount')::numeric) else 0 end,
      case when jsonb_typeof(v_metadata -> 'paid_cycle_count') = 'number'
        then abs((v_metadata ->> 'paid_cycle_count')::numeric) else 0 end
    );
    v_has_history := v_primary_amount > 0.005
      or coalesce(
        nullif(v_metadata ->> 'last_payment_transaction_id', ''),
        nullif(v_metadata ->> 'last_payment_date', ''),
        nullif(v_metadata ->> 'last_paid_billing_date', ''),
        nullif(v_metadata ->> 'last_subscription_reconciled_at', '')
      ) is not null;
  end if;

  if v_has_history then
    raise exception 'Used % must be deactivated instead of deleted.', v_record_label
      using errcode = '23503',
            hint = 'Set is_active to false and retain all linked financial history.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_used_asset_soft_delete on public.assets;
create trigger prevent_used_asset_soft_delete
before update of deleted_at on public.assets
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_asset_hard_delete on public.assets;
create trigger prevent_used_asset_hard_delete
before delete on public.assets
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_debt_soft_delete on public.debts;
create trigger prevent_used_debt_soft_delete
before update of deleted_at on public.debts
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_debt_hard_delete on public.debts;
create trigger prevent_used_debt_hard_delete
before delete on public.debts
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_savings_goal_soft_delete on public.savings_goals;
create trigger prevent_used_savings_goal_soft_delete
before update of deleted_at on public.savings_goals
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_savings_goal_hard_delete on public.savings_goals;
create trigger prevent_used_savings_goal_hard_delete
before delete on public.savings_goals
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_subscription_soft_delete on public.subscriptions;
create trigger prevent_used_subscription_soft_delete
before update of deleted_at on public.subscriptions
for each row execute function public.prevent_used_module_record_delete();

drop trigger if exists prevent_used_subscription_hard_delete on public.subscriptions;
create trigger prevent_used_subscription_hard_delete
before delete on public.subscriptions
for each row execute function public.prevent_used_module_record_delete();

-- Replace the earlier account guard with the complete lifecycle contract. All
-- financial/dependent rows count, including soft-deleted history and metadata
-- links. A legacy default-account preference is a non-financial pointer, so it
-- is cleared atomically instead of making an otherwise-unused account
-- impossible to delete.
create or replace function public.prevent_used_account_soft_delete()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_has_history boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
  end if;

  select
    exists (
      select 1 from public.transactions as txn
      where txn.user_id = old.user_id
        and (
          txn.account_id = old.id
          or txn.transfer_account_id = old.id
          or coalesce(txn.metadata, '{}'::jsonb) ->> 'credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.assets as asset
      where asset.user_id = old.user_id
        and (
          asset.account_id = old.id
          or coalesce(asset.metadata, '{}'::jsonb) ->> 'account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.debts as debt
      where debt.user_id = old.user_id
        and (
          debt.account_id = old.id
          or debt.payment_account_id = old.id
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'account_id' = old.id::text
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'payment_account_id' = old.id::text
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'credit_card_account_id' = old.id::text
          or coalesce(debt.metadata, '{}'::jsonb) ->> 'auto_credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.savings_goals as goal
      where goal.user_id = old.user_id
        and (
          goal.account_id = old.id
          or coalesce(goal.metadata, '{}'::jsonb) ->> 'account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.subscriptions as subscription
      where subscription.user_id = old.user_id
        and (
          subscription.account_id = old.id
          or coalesce(subscription.metadata, '{}'::jsonb) ->> 'account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.scenario_items as item
      where item.user_id = old.user_id and item.account_id = old.id
    )
    or exists (
      select 1 from public.file_links as link
      where link.user_id = old.user_id
        and regexp_replace(lower(btrim(coalesce(link.entity_type, ''))), '[^a-z0-9]+', '_', 'g') in ('account', 'accounts')
        and link.entity_id = old.id
    )
  into v_has_history;

  if v_has_history then
    raise exception 'Used financial accounts must be archived instead of deleted.'
      using errcode = '23503',
            hint = 'Settle the account, deactivate active dependents, and set is_active to false.';
  end if;

  update public.user_settings
  set default_account_id = null,
      updated_at = now()
  where user_id = old.user_id and default_account_id = old.id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_used_account_soft_delete on public.accounts;
create trigger prevent_used_account_soft_delete
before update of deleted_at on public.accounts
for each row execute function public.prevent_used_account_soft_delete();

drop trigger if exists prevent_used_account_hard_delete on public.accounts;
create trigger prevent_used_account_hard_delete
before delete on public.accounts
for each row execute function public.prevent_used_account_soft_delete();

-- New financial activity takes a shared lock on every referenced parent. A
-- concurrent archive/deactivate update therefore either completes first (and
-- the activity is rejected) or waits until the already-started activity has
-- committed. Historical edits that preserve their existing references remain
-- valid so old ledgers stay correct and editable.
create or replace function public.account_accepts_new_activity(
  p_account_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_is_active boolean := false;
begin
  if p_account_id is null then
    return true;
  end if;

  select account.is_active
  into v_is_active
  from public.accounts as account
  where account.id = p_account_id
    and account.user_id = p_user_id
    and account.deleted_at is null
  for share;
  return found and v_is_active;
end;
$$;

create or replace function public.module_record_accepts_new_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_type text := regexp_replace(lower(btrim(coalesce(p_entity_type, ''))), '[^a-z0-9]+', '_', 'g');
  v_is_active boolean := false;
begin
  if p_entity_id is null then
    return false;
  end if;

  case v_type
    when 'asset', 'assets' then
      select is_active and archived_at is null into v_is_active from public.assets
      where id = p_entity_id and user_id = p_user_id and deleted_at is null
      for share;
    when 'debt', 'debts' then
      select is_active and archived_at is null into v_is_active from public.debts
      where id = p_entity_id and user_id = p_user_id and deleted_at is null
      for share;
    when 'savings_goal', 'savings_goals' then
      select is_active and archived_at is null into v_is_active from public.savings_goals
      where id = p_entity_id and user_id = p_user_id and deleted_at is null
      for share;
    when 'subscription', 'subscriptions' then
      select is_active and archived_at is null into v_is_active from public.subscriptions
      where id = p_entity_id and user_id = p_user_id and deleted_at is null
      for share;
    else
      return false;
  end case;
  return found and v_is_active;
end;
$$;

create or replace function public.category_accepts_new_activity(
  p_category_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_accepts_activity boolean := false;
begin
  if p_category_id is null then
    return false;
  end if;

  select category.is_active
      and category.merged_into_category_id is null
      and lower(coalesce(category.category_level, category.metadata ->> 'category_level', 'sub')) <> 'super'
  into v_accepts_activity
  from public.categories as category
  where category.id = p_category_id
    and category.user_id = p_user_id
    and category.deleted_at is null
  for share;

  return found and coalesce(v_accepts_activity, false);
end;
$$;

-- Lifecycle-preserving edits may change only human-readable description
-- fields. Status, visibility, dates, amounts, classifications, references, and
-- metadata can all affect accounting or future execution and therefore count
-- as financial changes.
create or replace function public.financial_payload_changed(
  p_old jsonb,
  p_new jsonb,
  p_descriptive_fields text[]
)
returns boolean
language sql
immutable
as $$
  select (coalesce(p_old, '{}'::jsonb) - p_descriptive_fields)
    is distinct from (coalesce(p_new, '{}'::jsonb) - p_descriptive_fields);
$$;

create or replace function public.enforce_active_transaction_references()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_entity_type text := regexp_replace(lower(btrim(coalesce(new.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g');
  v_old_entity_type text := case when tg_op = 'UPDATE'
    then regexp_replace(lower(btrim(coalesce(old.related_entity_type, ''))), '[^a-z0-9]+', '_', 'g')
    else '' end;
  v_credit_account_id text := coalesce(new.metadata, '{}'::jsonb) ->> 'credit_card_account_id';
  v_old_credit_account_id text := case when tg_op = 'UPDATE'
    then coalesce(old.metadata, '{}'::jsonb) ->> 'credit_card_account_id' else null end;
  v_card_debt_id text := coalesce(new.metadata, '{}'::jsonb) ->> 'credit_card_debt_id';
  v_old_card_debt_id text := case when tg_op = 'UPDATE'
    then coalesce(old.metadata, '{}'::jsonb) ->> 'credit_card_debt_id' else null end;
  v_secondary_type text := regexp_replace(lower(btrim(coalesce(new.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g');
  v_old_secondary_type text := case when tg_op = 'UPDATE'
    then regexp_replace(lower(btrim(coalesce(old.metadata ->> 'secondary_related_entity_type', ''))), '[^a-z0-9]+', '_', 'g')
    else '' end;
  v_secondary_id text := new.metadata ->> 'secondary_related_entity_id';
  v_old_secondary_id text := case when tg_op = 'UPDATE' then old.metadata ->> 'secondary_related_entity_id' else null end;
  v_reference_active boolean;
  v_financial_changed boolean := case when tg_op = 'UPDATE' then public.financial_payload_changed(
    to_jsonb(old),
    to_jsonb(new),
    array['title', 'description', 'note', 'updated_at']::text[]
  ) else true end;
begin
  -- A preserved inactive reference may remain resolvable for notes and other
  -- descriptive corrections, but it cannot be finalized, reactivated,
  -- reclassified, hidden, unlinked, or otherwise changed financially.
  if tg_op = 'UPDATE' and v_financial_changed then
    if old.account_id is not null
      and not public.account_accepts_new_activity(old.account_id, old.user_id) then
      raise exception 'Restore the archived account before changing linked financial activity.'
        using errcode = '23514';
    end if;

    if old.transfer_account_id is not null
      and not public.account_accepts_new_activity(old.transfer_account_id, old.user_id) then
      raise exception 'Restore the archived transfer account before changing linked financial activity.'
        using errcode = '23514';
    end if;

    if v_old_credit_account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not public.account_accepts_new_activity(v_old_credit_account_id::uuid, old.user_id) then
      raise exception 'Restore the archived credit-card account before changing linked financial activity.'
        using errcode = '23514';
    end if;

    if v_old_entity_type in ('asset', 'assets', 'debt', 'debts', 'savings_goal', 'savings_goals', 'subscription', 'subscriptions')
      and not public.module_record_accepts_new_activity(v_old_entity_type, old.related_entity_id, old.user_id) then
      raise exception 'Restore the deactivated linked record before changing its financial activity.'
        using errcode = '23514';
    end if;

    if v_old_card_debt_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not public.module_record_accepts_new_activity('debt', v_old_card_debt_id::uuid, old.user_id) then
      raise exception 'Restore the deactivated credit-card borrowing before changing its financial activity.'
        using errcode = '23514';
    end if;

    if v_old_secondary_type in ('asset', 'assets', 'debt', 'debts', 'savings_goal', 'savings_goals', 'subscription', 'subscriptions')
      and v_old_secondary_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not public.module_record_accepts_new_activity(v_old_secondary_type, v_old_secondary_id::uuid, old.user_id) then
      raise exception 'Restore the deactivated secondary linked record before changing its financial activity.'
        using errcode = '23514';
    end if;
  end if;

  if new.account_id is not null then
    v_reference_active := public.account_accepts_new_activity(new.account_id, new.user_id);
    if (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id or new.account_id is distinct from old.account_id)
      and not v_reference_active then
      raise exception 'Inactive accounts cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  if new.transfer_account_id is not null then
    v_reference_active := public.account_accepts_new_activity(new.transfer_account_id, new.user_id);
    if (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id or new.transfer_account_id is distinct from old.transfer_account_id)
      and not v_reference_active then
      raise exception 'Inactive transfer accounts cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  if v_credit_account_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_reference_active := public.account_accepts_new_activity(v_credit_account_id::uuid, new.user_id);
    if (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id or v_credit_account_id is distinct from v_old_credit_account_id)
      and not v_reference_active then
      raise exception 'Inactive credit-card accounts cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  if new.category_id is not null
    and (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id or new.category_id is distinct from old.category_id)
    and not public.category_accepts_new_activity(new.category_id, new.user_id) then
    raise exception 'Only an active, owned, unmerged subcategory can receive new transaction activity.'
      using errcode = '23514';
  end if;

  if v_entity_type in ('asset', 'assets', 'debt', 'debts', 'savings_goal', 'savings_goals', 'subscription', 'subscriptions') then
    v_reference_active := public.module_record_accepts_new_activity(v_entity_type, new.related_entity_id, new.user_id);
    if not (tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id
      and v_entity_type = v_old_entity_type and new.related_entity_id is not distinct from old.related_entity_id)
      and not v_reference_active then
      raise exception 'Inactive linked records cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  if v_card_debt_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_reference_active := public.module_record_accepts_new_activity('debt', v_card_debt_id::uuid, new.user_id);
    if (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id or v_card_debt_id is distinct from v_old_card_debt_id)
      and not v_reference_active then
      raise exception 'Inactive credit-card borrowing cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  if v_secondary_type in ('asset', 'assets', 'debt', 'debts', 'savings_goal', 'savings_goals', 'subscription', 'subscriptions')
    and v_secondary_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
    v_reference_active := public.module_record_accepts_new_activity(v_secondary_type, v_secondary_id::uuid, new.user_id);
    if not (tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id
      and v_secondary_type = v_old_secondary_type and v_secondary_id is not distinct from v_old_secondary_id)
      and not v_reference_active then
      raise exception 'Inactive secondary linked records cannot receive new transaction activity.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_transaction_references on public.transactions;
create trigger enforce_active_transaction_references
before insert or update
on public.transactions
for each row execute function public.enforce_active_transaction_references();

create or replace function public.ensure_inactive_accounts_remain_settled()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.accounts as account
    join public.v_account_balances as balance
      on balance.account_id = account.id and balance.user_id = account.user_id
    where account.user_id = new.user_id
      and account.deleted_at is null
      and account.is_active = false
      and account.id::text in (
        coalesce(new.account_id::text, ''),
        coalesce(new.transfer_account_id::text, ''),
        coalesce(new.metadata ->> 'credit_card_account_id', ''),
        coalesce(old.account_id::text, ''),
        coalesce(old.transfer_account_id::text, ''),
        coalesce(old.metadata ->> 'credit_card_account_id', '')
      )
      and abs(coalesce(balance.current_balance, 0)) > 0.005
  ) then
    raise exception 'Restore the archived account before changing financial history that affects its settled position.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_inactive_accounts_remain_settled on public.transactions;
create trigger ensure_inactive_accounts_remain_settled
after update on public.transactions
for each row execute function public.ensure_inactive_accounts_remain_settled();

create or replace function public.prevent_transaction_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Financial transactions must be reversed or soft-deleted so their audit identity remains available.'
    using errcode = '23514';
end;
$$;

drop trigger if exists prevent_transaction_hard_delete on public.transactions;
create trigger prevent_transaction_hard_delete
before delete on public.transactions
for each row execute function public.prevent_transaction_hard_delete();

-- Restoring or relinking a module also locks and validates its account and
-- category. Plain edits that preserve an existing relationship remain allowed,
-- including historical rows whose category was subsequently hidden.
create or replace function public.enforce_active_module_account_reference()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_new_active boolean := coalesce((v_new ->> 'is_active')::boolean, true)
    and nullif(v_new ->> 'archived_at', '') is null;
  v_old_active boolean := case when tg_op = 'UPDATE'
    then coalesce((v_old ->> 'is_active')::boolean, true) and nullif(v_old ->> 'archived_at', '') is null
    else false end;
  v_key text;
  v_new_id text;
  v_old_id text;
  v_keys text[];
  v_new_category_id text := v_new ->> 'category_id';
  v_old_category_id text := v_old ->> 'category_id';
begin
  if not v_new_active then
    return new;
  end if;

  v_keys := case tg_table_name
    when 'assets' then array['account_id']
    when 'debts' then array['account_id', 'payment_account_id', 'metadata.credit_card_account_id', 'metadata.auto_credit_card_account_id']
    when 'savings_goals' then array['account_id']
    when 'subscriptions' then array['account_id']
    else array[]::text[]
  end;

  foreach v_key in array v_keys loop
    if v_key like 'metadata.%' then
      v_new_id := coalesce(v_new -> 'metadata', '{}'::jsonb) ->> split_part(v_key, '.', 2);
      v_old_id := coalesce(v_old -> 'metadata', '{}'::jsonb) ->> split_part(v_key, '.', 2);
    else
      v_new_id := v_new ->> v_key;
      v_old_id := v_old ->> v_key;
    end if;

    if v_new_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id
        or not v_old_active or v_new_id is distinct from v_old_id)
      and not public.account_accepts_new_activity(v_new_id::uuid, new.user_id) then
      raise exception 'Restore or relink the account before activating this record.'
        using errcode = '23514';
    end if;
  end loop;

  if v_new_category_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (tg_op <> 'UPDATE' or new.user_id is distinct from old.user_id
      or not v_old_active or v_new_category_id is distinct from v_old_category_id)
    and not public.category_accepts_new_activity(v_new_category_id::uuid, new.user_id) then
    raise exception 'Restore or relink an active, unmerged subcategory before activating this record.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_asset_account_reference on public.assets;
create trigger enforce_active_asset_account_reference
before insert or update on public.assets
for each row execute function public.enforce_active_module_account_reference();

drop trigger if exists enforce_active_debt_account_reference on public.debts;
create trigger enforce_active_debt_account_reference
before insert or update on public.debts
for each row execute function public.enforce_active_module_account_reference();

drop trigger if exists enforce_active_savings_account_reference on public.savings_goals;
create trigger enforce_active_savings_account_reference
before insert or update on public.savings_goals
for each row execute function public.enforce_active_module_account_reference();

drop trigger if exists enforce_active_subscription_account_reference on public.subscriptions;
create trigger enforce_active_subscription_account_reference
before insert or update on public.subscriptions
for each row execute function public.enforce_active_module_account_reference();

-- Direct writes to legacy child tables must obey the same lifecycle as normal
-- transaction actions. Inserts and retargets require an active owned parent;
-- financial edits to an existing child also require the parent to be active.
-- A note-only correction remains possible so retained history is still
-- explainable after deactivation.
create or replace function public.enforce_active_financial_child_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_new_row jsonb := to_jsonb(new);
  v_old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  v_entity_type text;
  v_parent_key text;
  v_new_parent_id text;
  v_old_parent_id text;
  v_financial_changed boolean := case when tg_op = 'UPDATE' then public.financial_payload_changed(
    v_old_row,
    v_new_row,
    array['note', 'updated_at']::text[]
  ) else true end;
  v_old_parent_active boolean := false;
begin
  case tg_table_name
    when 'debt_payments' then
      v_entity_type := 'debt';
      v_parent_key := 'debt_id';
    when 'savings_goal_entries' then
      v_entity_type := 'savings_goal';
      v_parent_key := 'savings_goal_id';
    when 'subscription_payments' then
      v_entity_type := 'subscription';
      v_parent_key := 'subscription_id';
    else
      raise exception 'Unsupported financial child table: %', tg_table_name;
  end case;

  v_new_parent_id := v_new_row ->> v_parent_key;
  v_old_parent_id := v_old_row ->> v_parent_key;

  if tg_op = 'UPDATE'
    and v_old_parent_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_old_parent_active := public.module_record_accepts_new_activity(
      v_entity_type,
      v_old_parent_id::uuid,
      old.user_id
    );
    if v_financial_changed and not v_old_parent_active then
      raise exception 'Restore the deactivated parent before changing retained financial history.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op <> 'UPDATE'
    or new.user_id is distinct from old.user_id
    or v_new_parent_id is distinct from v_old_parent_id then
    if v_new_parent_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not public.module_record_accepts_new_activity(v_entity_type, v_new_parent_id::uuid, new.user_id) then
      raise exception 'Only an active, owned parent can receive new financial history.'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_active_debt_payment_parent on public.debt_payments;
create trigger enforce_active_debt_payment_parent
before insert or update on public.debt_payments
for each row execute function public.enforce_active_financial_child_parent();

drop trigger if exists enforce_active_savings_entry_parent on public.savings_goal_entries;
create trigger enforce_active_savings_entry_parent
before insert or update on public.savings_goal_entries
for each row execute function public.enforce_active_financial_child_parent();

drop trigger if exists enforce_active_subscription_payment_parent on public.subscription_payments;
create trigger enforce_active_subscription_payment_parent
before insert or update on public.subscription_payments
for each row execute function public.enforce_active_financial_child_parent();

create or replace function public.prevent_financial_child_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Financial history rows cannot be physically deleted; retain their audit identity.'
    using errcode = '23514';
  return old;
end;
$$;

drop trigger if exists prevent_debt_payment_hard_delete on public.debt_payments;
create trigger prevent_debt_payment_hard_delete
before delete on public.debt_payments
for each row execute function public.prevent_financial_child_hard_delete();

drop trigger if exists prevent_savings_entry_hard_delete on public.savings_goal_entries;
create trigger prevent_savings_entry_hard_delete
before delete on public.savings_goal_entries
for each row execute function public.prevent_financial_child_hard_delete();

drop trigger if exists prevent_subscription_payment_hard_delete on public.subscription_payments;
create trigger prevent_subscription_payment_hard_delete
before delete on public.subscription_payments
for each row execute function public.prevent_financial_child_hard_delete();

-- Account archival is checked again inside the database while the account row
-- is locked. The transaction/module triggers above use a conflicting shared
-- lock, closing the read-then-write race in application validation.
create or replace function public.prevent_unsafe_account_archive()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_balance numeric := 0;
  v_metadata jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_events jsonb := case
    when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb) -> 'lifecycle_events') = 'array'
      then coalesce(new.metadata, '{}'::jsonb) -> 'lifecycle_events'
    else '[]'::jsonb
  end;
  v_event_at text;
  v_last_state text;
begin
  if old.is_active is not distinct from new.is_active then
    return new;
  end if;

  -- A direct restore receives the same effective-dated metadata as the Server
  -- Action. Do not append a duplicate when the application already supplied
  -- the active event in this update.
  if old.is_active = false and new.is_active = true then
    v_event_at := coalesce(
      nullif(v_metadata ->> 'restored_at', ''),
      to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    );
    v_last_state := lower(coalesce(v_events -> -1 ->> 'state', ''));
    if v_last_state <> 'active' then
      v_events := v_events || jsonb_build_array(jsonb_build_object('at', v_event_at, 'state', 'active'));
    end if;
    new.metadata := v_metadata || jsonb_build_object(
      'archived_at', null,
      'is_active', true,
      'lifecycle_events', v_events,
      'lifecycle_status', 'active',
      'restored_at', v_event_at
    );
    return new;
  end if;

  select coalesce(balance.current_balance, 0)
  into v_balance
  from public.v_account_balances as balance
  where balance.account_id = old.id
    and balance.user_id = old.user_id;

  if abs(coalesce(v_balance, 0)) > 0.005 then
    raise exception 'Settle the reconciled account position before archiving it.'
      using errcode = '23514';
  end if;

  if exists (
    select 1 from public.transactions as txn
    where txn.user_id = old.user_id
      and txn.deleted_at is null
      and lower(coalesce(txn.status, '')) = 'scheduled'
      and lower(coalesce(txn.metadata ->> 'future_status', 'active')) <> 'paused'
      and (txn.account_id = old.id or txn.transfer_account_id = old.id or txn.metadata ->> 'credit_card_account_id' = old.id::text)
  ) or exists (
    select 1 from public.debts as debt
    where debt.user_id = old.user_id and debt.deleted_at is null and debt.is_active = true
      and lower(coalesce(debt.status, debt.metadata ->> 'status', 'active')) not in ('archived', 'cancelled', 'canceled', 'completed', 'paid')
      and (debt.account_id = old.id or debt.payment_account_id = old.id
        or debt.metadata ->> 'credit_card_account_id' = old.id::text
        or debt.metadata ->> 'auto_credit_card_account_id' = old.id::text)
  ) or exists (
    select 1 from public.savings_goals as goal
    where goal.user_id = old.user_id and goal.deleted_at is null and goal.is_active = true
      and lower(coalesce(goal.status, goal.metadata ->> 'status', 'active')) not in ('archived', 'completed')
      and goal.account_id = old.id
  ) or exists (
    select 1 from public.subscriptions as subscription
    where subscription.user_id = old.user_id and subscription.deleted_at is null and subscription.is_active = true
      and lower(coalesce(subscription.status, subscription.metadata ->> 'status', 'active')) in ('active', 'expiring')
      and subscription.account_id = old.id
  ) then
    raise exception 'Deactivate active account dependents before archiving this account.'
      using errcode = '23514';
  end if;

  update public.user_settings
  set default_account_id = null,
      updated_at = now()
  where user_id = old.user_id
    and default_account_id = old.id;

  v_event_at := coalesce(
    nullif(v_metadata ->> 'archived_at', ''),
    to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );
  v_last_state := lower(coalesce(v_events -> -1 ->> 'state', ''));
  if v_last_state <> 'archived' then
    v_events := v_events || jsonb_build_array(jsonb_build_object('at', v_event_at, 'state', 'archived'));
  end if;
  new.metadata := v_metadata || jsonb_build_object(
    'archived_at', v_event_at,
    'is_active', false,
    'lifecycle_events', v_events,
    'lifecycle_status', 'archived',
    'retirement_reason', coalesce(nullif(v_metadata ->> 'retirement_reason', ''), 'no_longer_used')
  );

  return new;
end;
$$;

drop trigger if exists prevent_unsafe_account_archive on public.accounts;
create trigger prevent_unsafe_account_archive
before update of is_active on public.accounts
for each row execute function public.prevent_unsafe_account_archive();

create or replace function public.enforce_category_merge_level()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source_level text := lower(coalesce(new.category_level, new.metadata ->> 'category_level', 'sub'));
  v_source_type text := lower(coalesce(new.category_type, new.type, new.metadata ->> 'category_type', ''));
  v_target_level text;
  v_target_type text;
begin
  if new.merged_into_category_id is null
    or new.merged_into_category_id is not distinct from old.merged_into_category_id then
    return new;
  end if;

  select lower(coalesce(target.category_level, target.metadata ->> 'category_level', 'sub')),
         lower(coalesce(target.category_type, target.type, target.metadata ->> 'category_type', ''))
  into v_target_level, v_target_type
  from public.categories as target
  where target.id = new.merged_into_category_id
    and target.user_id = new.user_id
    and target.is_active = true
    and target.merged_into_category_id is null
    and target.deleted_at is null
  for share;

  if v_target_level is null or v_source_level <> v_target_level or v_source_type <> v_target_type then
    raise exception 'Categories can only merge into an active category of the same type and hierarchy level.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_category_merge_level on public.categories;
create trigger enforce_category_merge_level
before update of merged_into_category_id on public.categories
for each row execute function public.enforce_category_merge_level();
