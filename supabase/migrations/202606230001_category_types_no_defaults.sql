-- New users must start without default categories, and page-specific categories
-- must not be modeled as transaction income/expense categories in the app.

update public.categories
set is_active = false,
    deleted_at = coalesce(deleted_at, now()),
    updated_at = now()
where user_id is null
  and deleted_at is null;

update public.categories
set is_default = false,
    metadata = coalesce(metadata, '{}'::jsonb) - 'hidden_default_id' - 'source_default_id',
    updated_at = now()
where user_id is not null
  and (
    is_default = true
    or metadata ? 'hidden_default_id'
    or metadata ? 'source_default_id'
  );

update public.categories
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'category_type',
      case
        when metadata -> 'scopes' ? 'Accounts' then 'Account'
        when metadata -> 'scopes' ? 'Assets' then 'Asset'
        when metadata -> 'scopes' ? 'Debts' then 'Debt'
        when metadata -> 'scopes' ? 'Savings Goals' then 'Savings Goal'
        when metadata -> 'scopes' ? 'Subscriptions' then 'Subscription'
        when lower(type) = 'income' then 'Income'
        else 'Expense'
      end
    ),
    updated_at = now()
where user_id is not null
  and not (coalesce(metadata, '{}'::jsonb) ? 'category_type');

drop policy if exists category_read on public.categories;
create policy category_read on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);
