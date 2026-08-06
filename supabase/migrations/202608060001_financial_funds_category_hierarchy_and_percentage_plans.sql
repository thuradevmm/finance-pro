-- Add explicit semantics for category groups, open-ended savings funds, and
-- percentage-based future-planning controls while preserving every legacy row.

alter table public.categories
  add column if not exists category_level text not null default 'subcategory',
  add column if not exists financial_role text;

update public.categories
set category_level = 'subcategory'
where category_level is null
   or category_level not in ('super', 'subcategory');

alter table public.categories
  add constraint categories_category_level_check
    check (category_level in ('super', 'subcategory')),
  add constraint categories_financial_role_check
    check (financial_role is null or financial_role in (
      'essential', 'debt_obligation', 'emergency_reserve',
      'savings', 'discretionary', 'income', 'other'
    )),
  add constraint categories_super_has_no_parent_check
    check (category_level <> 'super' or parent_id is null),
  add constraint categories_not_own_parent_check
    check (parent_id is null or parent_id <> id);

create index if not exists categories_user_parent_active_idx
  on public.categories (user_id, parent_id)
  where deleted_at is null;

alter table public.savings_goals
  add column if not exists goal_type text not null default 'target',
  add column if not exists account_amount_type text not null default 'General',
  add column if not exists contribution_type text not null default 'fixed',
  add column if not exists contribution_percentage numeric(7, 4);

-- Existing goals predate an explicit bucket selection. Prefer the account's
-- Saving bucket, otherwise retain its first configured bucket. This keeps
-- legacy goal activity attached to a real amount type instead of inventing a
-- General bucket that the account may not expose.
update public.savings_goals as goal
set account_amount_type = coalesce(
  (
    select btrim(amount_type.item ->> 'type')
    from jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(account.metadata, '{}'::jsonb) -> 'amount_types') = 'array'
          then coalesce(account.metadata, '{}'::jsonb) -> 'amount_types'
        else '[]'::jsonb
      end
    ) with ordinality as amount_type(item, position)
    where nullif(btrim(amount_type.item ->> 'type'), '') is not null
    order by
      (lower(btrim(amount_type.item ->> 'type')) = 'saving') desc,
      amount_type.position
    limit 1
  ),
  case
    when coalesce(account.metadata, '{}'::jsonb) ? 'saving_amount' then 'Saving'
    when coalesce(account.metadata, '{}'::jsonb) ? 'operation_amount' then 'Operation'
    else 'General'
  end
)
from public.accounts as account
where goal.account_id = account.id
  and goal.user_id = account.user_id
  and goal.account_amount_type = 'General';

update public.savings_goals
set goal_type = 'target',
    account_amount_type = coalesce(nullif(btrim(account_amount_type), ''), 'General'),
    contribution_type = 'fixed'
where goal_type is null
   or goal_type not in ('target', 'fund')
   or account_amount_type is null
   or btrim(account_amount_type) = ''
   or contribution_type is null
   or contribution_type not in ('fixed', 'percentage');

-- Rows without a complete legacy target definition are preserved as
-- open-ended funds instead of being rejected by the new invariant.
update public.savings_goals
set goal_type = 'fund',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'goal_type', 'fund',
      'converted_from_incomplete_legacy_target', true
    )
where target_amount <= 0
   or target_date is null;

alter table public.savings_goals
  add constraint savings_goals_goal_type_check
    check (goal_type in ('target', 'fund')),
  add constraint savings_goals_account_amount_type_check
    check (char_length(btrim(account_amount_type)) between 1 and 80),
  add constraint savings_goals_contribution_type_check
    check (contribution_type in ('fixed', 'percentage')),
  add constraint savings_goals_contribution_percentage_check
    check (
      (contribution_type = 'fixed' and contribution_percentage is null)
      or (contribution_type = 'percentage' and contribution_percentage > 0 and contribution_percentage <= 100)
    ),
  add constraint savings_goals_target_definition_check
    check (
      (goal_type = 'target' and target_amount > 0 and target_date is not null)
      or (goal_type = 'fund' and target_amount >= 0)
    );

alter table public.transactions
  add column if not exists savings_action text;

alter table public.transactions
  add constraint transactions_savings_action_check
    check (savings_action is null or savings_action in ('deposit', 'withdrawal'));

alter table public.future_planning_amounts
  add column if not exists amount_type text not null default 'fixed',
  add column if not exists percentage numeric(7, 4);

update public.future_planning_amounts
set amount_type = 'fixed',
    percentage = null
where amount_type is null
   or amount_type not in ('fixed', 'percentage');

alter table public.future_planning_amounts
  add constraint future_planning_amounts_amount_type_check
    check (amount_type in ('fixed', 'percentage')),
  add constraint future_planning_amounts_percentage_check
    check (
      (amount_type = 'fixed' and percentage is null)
      or (amount_type = 'percentage' and amount = 0 and percentage > 0 and percentage <= 100)
    );

comment on column public.categories.category_level is
  'Super categories are reporting-only groups; subcategories remain selectable by financial records.';
comment on column public.categories.financial_role is
  'Optional user-selected purpose used for explainable dashboard health indicators.';
comment on column public.savings_goals.goal_type is
  'target requires a target amount/date; fund is open-ended reusable capital.';
comment on column public.transactions.savings_action is
  'Explicit effect of a linked transaction on a savings goal or fund.';
comment on column public.future_planning_amounts.percentage is
  'For percentage rows, share of that month''s total planned income.';
