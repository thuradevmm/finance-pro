-- Extend the account-history guard to physical deletes. Direct foreign keys
-- protect most relationships, while this trigger also covers account links
-- stored in transaction and debt metadata.

create or replace function public.prevent_used_account_soft_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if old.deleted_at is not null or new.deleted_at is null then
      return new;
    end if;
  end if;

  if (
    exists (
      select 1
      from public.transactions as txn
      where txn.user_id = old.user_id
        and (
          txn.account_id = old.id
          or txn.transfer_account_id = old.id
          or coalesce(txn.metadata, '{}'::jsonb)->>'credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.assets as asset
      where asset.user_id = old.user_id and asset.account_id = old.id
    )
    or exists (
      select 1
      from public.debts as debt
      where debt.user_id = old.user_id
        and (
          debt.account_id = old.id
          or debt.payment_account_id = old.id
          or coalesce(debt.metadata, '{}'::jsonb)->>'credit_card_account_id' = old.id::text
          or coalesce(debt.metadata, '{}'::jsonb)->>'auto_credit_card_account_id' = old.id::text
        )
    )
    or exists (
      select 1 from public.savings_goals as goal
      where goal.user_id = old.user_id and goal.account_id = old.id
    )
    or exists (
      select 1 from public.subscriptions as subscription
      where subscription.user_id = old.user_id and subscription.account_id = old.id
    )
    or exists (
      select 1 from public.scenario_items as item
      where item.user_id = old.user_id and item.account_id = old.id
    )
    or exists (
      select 1 from public.user_settings as settings
      where settings.user_id = old.user_id and settings.default_account_id = old.id
    )
  )
  then
    raise exception 'Used financial accounts must be archived instead of deleted.'
      using errcode = '23503';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_used_account_hard_delete on public.accounts;
create trigger prevent_used_account_hard_delete
before delete on public.accounts
for each row execute function public.prevent_used_account_soft_delete();
