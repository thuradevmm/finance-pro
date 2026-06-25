-- Category monthly average is now calculated from transactions, and category
-- style is derived from category type instead of user-selected fields.

with styled_categories as (
  select
    id,
    case
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Account', 'Accounts') then 'Account'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Asset', 'Assets') then 'Asset'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Debt', 'Debts') then 'Debt'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Savings Goal', 'Savings Goals') then 'Savings Goal'
      when coalesce(metadata, '{}'::jsonb) ->> 'category_type' in ('Subscription', 'Subscriptions') then 'Subscription'
      when lower(type) = 'income' or coalesce(metadata, '{}'::jsonb) ->> 'category_type' = 'Income' then 'Income'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Accounts' then 'Account'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Assets' then 'Asset'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Debts' then 'Debt'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Savings Goals' then 'Savings Goal'
      when coalesce(metadata, '{}'::jsonb) -> 'scopes' ? 'Subscriptions' then 'Subscription'
      else 'Expense'
    end as category_type
  from public.categories
  where user_id is not null
)
update public.categories as categories
set color = case styled_categories.category_type
      when 'Account' then 'Blue'
      when 'Asset' then 'Gray'
      when 'Debt' then 'Amber'
      when 'Expense' then 'Red'
      when 'Income' then 'Green'
      when 'Savings Goal' then 'Indigo'
      when 'Subscription' then 'Purple'
      else 'Red'
    end,
    icon = case styled_categories.category_type
      when 'Account' then 'account'
      when 'Asset' then 'box'
      when 'Debt' then 'credit'
      when 'Expense' then 'trendingDown'
      when 'Income' then 'trendingUp'
      when 'Savings Goal' then 'target'
      when 'Subscription' then 'subscriptions'
      else 'trendingDown'
    end,
    metadata = (coalesce(categories.metadata, '{}'::jsonb) - 'monthly_average') || jsonb_build_object('category_type', styled_categories.category_type),
    updated_at = now()
from styled_categories
where categories.id = styled_categories.id;
