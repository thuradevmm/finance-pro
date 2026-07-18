-- Align reporting views with the application's posted-status, reversal,
-- linked-module, and current-record calculation semantics.

create or replace view public.v_monthly_income_expense as
with economic_transactions as (
  select
    txn.user_id,
    txn.transaction_date,
    lower(coalesce(
      nullif(txn.metadata->>'reversed_transaction_type', ''),
      source.type,
      case lower(txn.type)
        when 'income' then 'expense'
        when 'expense' then 'income'
        when 'transfer' then 'transfer'
        else ''
      end
    )) as reversed_type,
    nullif(txn.metadata->>'reversed_transaction_id', '') is not null as is_reversal,
    (
      lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(txn.metadata->>'financial_event', '')) = 'credit_card_payment'
      or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'credit_card_payment', 'false')) = 'true'
      or lower(coalesce(source.metadata->>'financial_event', '')) = 'credit_card_payment'
    ) as is_card_payment_flow,
    lower(txn.type) as transaction_type,
    abs(coalesce(txn.amount, 0)) as amount
  from public.transactions as txn
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.deleted_at is null
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
), effects as (
  select
    user_id,
    transaction_date,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'income' then -amount
      when not is_reversal and transaction_type = 'income' then amount
      else 0
    end as income_delta,
    case
      when is_card_payment_flow then 0
      when is_reversal and reversed_type = 'expense' then -amount
      when not is_reversal and transaction_type = 'expense' then amount
      else 0
    end as expense_delta
  from economic_transactions
)
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  coalesce(sum(income_delta), 0) as total_income,
  coalesce(sum(expense_delta), 0) as total_expense,
  coalesce(sum(income_delta - expense_delta), 0) as net_amount,
  count(*) filter (where income_delta <> 0 or expense_delta <> 0) as transaction_count
from effects
group by user_id, date_trunc('month', transaction_date);

alter view public.v_monthly_income_expense set (security_invoker = true);

create or replace view public.v_yearly_income_expense as
select
  user_id,
  date_trunc('year', month)::date as year,
  sum(total_income) as total_income,
  sum(total_expense) as total_expense,
  sum(net_amount) as net_amount,
  sum(transaction_count)::bigint as transaction_count
from public.v_monthly_income_expense
group by user_id, date_trunc('year', month)::date;

alter view public.v_yearly_income_expense set (security_invoker = true);

-- The historical baseline and a later reconciliation used different column
-- orders. PostgreSQL cannot reorder columns with CREATE OR REPLACE VIEW, so
-- recreate this non-dependent reporting view explicitly and restore access.
drop view if exists public.v_budget_vs_actual;

create view public.v_budget_vs_actual as
with plan_ranges as (
  select
    plan.*,
    coalesce(
      plan.end_date,
      case lower(plan.period_type)
        when 'yearly' then (date_trunc('year', plan.start_date) + interval '1 year - 1 day')::date
        else (date_trunc('month', plan.start_date) + interval '1 month - 1 day')::date
      end
    ) as effective_end_date
  from public.budget_plans as plan
  where plan.deleted_at is null
)
select
  item.id as budget_item_id,
  plan.id as budget_plan_id,
  plan.user_id,
  plan.name as budget_name,
  plan.period_type,
  plan.plan_type,
  plan.status as budget_plan_status,
  plan.start_date,
  plan.effective_end_date as end_date,
  item.category_id,
  category.name as category_name,
  item.type,
  item.planned_amount,
  greatest(coalesce(actual.actual_amount, 0), 0) as actual_amount,
  item.planned_amount - greatest(coalesce(actual.actual_amount, 0), 0) as remaining_amount,
  case
    when item.planned_amount <= 0 then 0
    else round((greatest(coalesce(actual.actual_amount, 0), 0) / item.planned_amount) * 100, 2)
  end as usage_percentage,
  case
    when item.planned_amount <= 0 then 'No Budget'
    when greatest(coalesce(actual.actual_amount, 0), 0) > item.planned_amount then 'Over Budget'
    when greatest(coalesce(actual.actual_amount, 0), 0) >= item.planned_amount * (coalesce(item.alert_percentage, 80) / 100) then 'Near Limit'
    else 'Under Budget'
  end as budget_status,
  item.created_at,
  item.updated_at
from public.budget_items as item
join plan_ranges as plan on plan.id = item.budget_plan_id
left join public.categories as category on category.id = item.category_id
left join lateral (
  select sum(
    case
      when lower(coalesce(txn.metadata->>'credit_card_payment', 'false')) = 'true'
        or lower(coalesce(txn.metadata->>'financial_event', '')) = 'credit_card_payment'
        or lower(coalesce(txn.metadata->>'reversed_credit_card_payment', 'false')) = 'true'
        or lower(coalesce(source.metadata->>'credit_card_payment', 'false')) = 'true'
        or lower(coalesce(source.metadata->>'financial_event', '')) = 'credit_card_payment'
        then 0
      when nullif(txn.metadata->>'reversed_transaction_id', '') is not null
        and lower(coalesce(
          nullif(txn.metadata->>'reversed_transaction_type', ''),
          source.type,
          case lower(txn.type) when 'income' then 'expense' when 'expense' then 'income' else '' end
        )) = 'expense'
        then -abs(coalesce(txn.amount, 0))
      when nullif(txn.metadata->>'reversed_transaction_id', '') is null and lower(txn.type) = 'expense'
        then abs(coalesce(txn.amount, 0))
      else 0
    end
  ) as actual_amount
  from public.transactions as txn
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.user_id = plan.user_id
    and txn.category_id = item.category_id
    and txn.deleted_at is null
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
    and txn.transaction_date >= plan.start_date
    and txn.transaction_date <= plan.effective_end_date
) as actual on true;

alter view public.v_budget_vs_actual set (security_invoker = true);
grant select on public.v_budget_vs_actual to anon, authenticated, service_role;

create or replace view public.v_savings_goal_progress as
with entry_totals as (
  select
    entry.savings_goal_id,
    sum(case when lower(entry.type) in ('withdrawal', 'expense') then -abs(entry.amount) else abs(entry.amount) end) as entry_amount
  from public.savings_goal_entries as entry
  left join public.transactions as entry_transaction
    on entry_transaction.id = entry.transaction_id
   and entry_transaction.user_id = entry.user_id
  where entry.transaction_id is null
     or (
       entry_transaction.deleted_at is null
       and lower(coalesce(entry_transaction.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
     )
  group by entry.savings_goal_id
), linked_transaction_totals as (
  select
    txn.related_entity_id as savings_goal_id,
    sum(
      case
        when nullif(txn.metadata->>'reversed_transaction_id', '') is not null
          and lower(coalesce(
            nullif(txn.metadata->>'reversed_transaction_type', ''),
            source.type,
            case lower(txn.type) when 'income' then 'expense' when 'expense' then 'income' when 'transfer' then 'transfer' else '' end
          )) = 'expense'
          and lower(txn.type) = 'income'
          then -abs(coalesce(txn.amount, 0))
        when lower(txn.type) = 'transfer'
          and lower(coalesce(txn.metadata->>'transfer_direction', txn.metadata->>'same_account_transfer_role', 'debit')) in ('debit', 'out')
          and txn.transfer_account_id = goal.account_id
          then abs(coalesce(txn.amount, 0))
        when lower(txn.type) = 'transfer'
          and lower(coalesce(txn.metadata->>'transfer_direction', txn.metadata->>'same_account_transfer_role', 'debit')) in ('debit', 'out')
          and txn.account_id = goal.account_id
          then -abs(coalesce(txn.amount, 0))
        when nullif(txn.metadata->>'reversed_transaction_id', '') is null and lower(txn.type) = 'expense'
          then abs(coalesce(txn.amount, 0))
        else 0
      end
    ) as transaction_amount
  from public.transactions as txn
  join public.savings_goals as goal
    on goal.id = txn.related_entity_id
   and goal.user_id = txn.user_id
  left join public.transactions as source
    on source.id = case
      when txn.metadata->>'reversed_transaction_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (txn.metadata->>'reversed_transaction_id')::uuid
      else null
    end
   and source.user_id = txn.user_id
  where txn.related_entity_type = 'savings_goal'
    and txn.related_entity_id is not null
    and txn.deleted_at is null
    and lower(coalesce(txn.status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
    and not exists (
      select 1
      from public.savings_goal_entries as entry
      where entry.transaction_id = txn.id
    )
  group by txn.related_entity_id
), goal_amounts as (
  select
    goal.*,
    coalesce(
      goal.saved_amount,
      goal.initial_saved_amount,
      goal.current_amount,
      case when nullif(goal.metadata->>'saved_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (goal.metadata->>'saved_amount')::numeric end,
      case when nullif(goal.metadata->>'current_amount', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then (goal.metadata->>'current_amount')::numeric end,
      0
    ) as stored_saved_amount,
    coalesce(entry_total.entry_amount, 0) + coalesce(transaction_total.transaction_amount, 0) as linked_saved_amount
  from public.savings_goals as goal
  left join entry_totals as entry_total on entry_total.savings_goal_id = goal.id
  left join linked_transaction_totals as transaction_total on transaction_total.savings_goal_id = goal.id
  where goal.deleted_at is null
), progress as (
  select
    goal_amounts.*,
    greatest(stored_saved_amount + linked_saved_amount, 0) as calculated_saved_amount
  from goal_amounts
)
select
  progress.id as savings_goal_id,
  progress.user_id,
  progress.name,
  progress.target_amount,
  progress.initial_saved_amount,
  progress.calculated_saved_amount as saved_amount,
  greatest(progress.target_amount - progress.calculated_saved_amount, 0) as remaining_amount,
  case
    when progress.target_amount <= 0 then 0
    else least(round((progress.calculated_saved_amount / progress.target_amount) * 100, 2), 100)
  end as progress_percentage,
  progress.target_date,
  case
    when progress.target_amount > 0 and progress.calculated_saved_amount >= progress.target_amount then 'completed'
    when progress.target_date is not null and progress.target_date < current_date then 'behind'
    else 'active'
  end as status,
  progress.created_at,
  progress.updated_at
from progress;

alter view public.v_savings_goal_progress set (security_invoker = true);

-- Earlier deployments exposed the people totals in the opposite column order.
-- Align the existing column names before CREATE OR REPLACE so PostgreSQL can
-- preserve the view and its grants without interpreting this as a rename.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v_people_payment_summary'
      and ordinal_position = 4
      and column_name = 'total_outgoing'
  ) then
    alter view public.v_people_payment_summary rename column total_outgoing to legacy_total_outgoing;
    alter view public.v_people_payment_summary rename column total_incoming to total_outgoing;
    alter view public.v_people_payment_summary rename column legacy_total_outgoing to total_incoming;

    alter view public.v_people_payment_summary rename column unpaid_lent_amount to legacy_unpaid_lent_amount;
    alter view public.v_people_payment_summary rename column unpaid_borrowed_amount to unpaid_lent_amount;
    alter view public.v_people_payment_summary rename column legacy_unpaid_lent_amount to unpaid_borrowed_amount;
  end if;
end;
$$;

create or replace view public.v_people_payment_summary as
select
  person.id as person_id,
  person.user_id,
  person.name,
  coalesce(sum(abs(payment_record.amount)) filter (where lower(payment_record.type) in ('received', 'incoming', 'borrowed', 'borrowed_from')), 0) as total_incoming,
  coalesce(sum(abs(payment_record.amount)) filter (where lower(payment_record.type) in ('paid', 'outgoing', 'lent', 'lent_to')), 0) as total_outgoing,
  coalesce(sum(abs(payment_record.amount)) filter (
    where lower(payment_record.type) in ('borrowed', 'borrowed_from')
      and lower(coalesce(payment_record.status, 'unpaid')) <> 'paid'
  ), 0) as unpaid_borrowed_amount,
  coalesce(sum(abs(payment_record.amount)) filter (
    where lower(payment_record.type) in ('lent', 'lent_to')
      and lower(coalesce(payment_record.status, 'unpaid')) <> 'paid'
  ), 0) as unpaid_lent_amount,
  person.created_at,
  person.updated_at
from public.people as person
left join public.person_payment_records as payment_record
  on payment_record.person_id = person.id
 and payment_record.deleted_at is null
where person.deleted_at is null
group by person.id, person.user_id, person.name, person.created_at, person.updated_at;

alter view public.v_people_payment_summary set (security_invoker = true);

create or replace view public.v_dashboard_summary as
with account_totals as (
  select user_id, sum(current_balance) as total_balance
  from public.v_account_balances
  where is_active = true
  group by user_id
), month_totals as (
  select user_id, total_income, total_expense
  from public.v_monthly_income_expense
  where month = date_trunc('month', current_date)::date
), transaction_counts as (
  select user_id, count(*) as transaction_count
  from public.transactions
  where deleted_at is null
    and lower(coalesce(status, 'cleared')) not in ('scheduled', 'cancelled', 'canceled', 'void', 'failed')
  group by user_id
), debt_counts as (
  select user_id, count(*) as active_debt_count
  from public.debts
  where deleted_at is null
    and lower(coalesce(status, 'active')) not in ('paid', 'settled', 'completed', 'archived')
  group by user_id
), savings_counts as (
  select user_id, count(*) as active_savings_goal_count
  from public.v_savings_goal_progress
  where lower(status) <> 'completed'
  group by user_id
), subscription_counts as (
  select user_id, count(*) as active_subscription_count
  from public.subscriptions
  where deleted_at is null and lower(coalesce(status, 'active')) in ('active', 'expiring')
  group by user_id
), users as (
  select user_id from public.accounts where deleted_at is null
  union
  select user_id from public.transactions where deleted_at is null
  union
  select user_id from public.debts where deleted_at is null
  union
  select user_id from public.savings_goals where deleted_at is null
  union
  select user_id from public.subscriptions where deleted_at is null
)
select
  users.user_id,
  coalesce(account_totals.total_balance, 0) as total_balance,
  coalesce(month_totals.total_income, 0) as current_month_income,
  coalesce(month_totals.total_expense, 0) as current_month_expense,
  coalesce(transaction_counts.transaction_count, 0) as transaction_count,
  coalesce(debt_counts.active_debt_count, 0) as active_debt_count,
  coalesce(savings_counts.active_savings_goal_count, 0) as active_savings_goal_count,
  coalesce(subscription_counts.active_subscription_count, 0) as active_subscription_count
from users
left join account_totals using (user_id)
left join month_totals using (user_id)
left join transaction_counts using (user_id)
left join debt_counts using (user_id)
left join savings_counts using (user_id)
left join subscription_counts using (user_id);

alter view public.v_dashboard_summary set (security_invoker = true);
