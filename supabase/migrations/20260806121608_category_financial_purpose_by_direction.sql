-- Financial purposes describe different economic directions. Keep Debit and
-- Credit reporting groups distinct, while giving page-scoped category types a
-- smaller purpose catalog that matches their module.

update public.categories as category
set financial_role = 'other',
    metadata = coalesce(category.metadata, '{}'::jsonb) || jsonb_build_object(
      'financial_purpose_repair', jsonb_build_object(
        'previous_role', category.financial_role,
        'reason', 'purpose_incompatible_with_category_type',
        'repaired_at', now()
      )
    )
where category.category_level = 'super'
  and not coalesce(case category.category_type
    when 'expense' then category.financial_role in ('essential', 'debt_obligation', 'discretionary', 'other')
    when 'income' then category.financial_role in ('income', 'other')
    when 'account' then category.financial_role in ('emergency_reserve', 'savings', 'other')
    when 'asset' then category.financial_role in ('savings', 'discretionary', 'other')
    when 'debt' then category.financial_role in ('debt_obligation', 'other')
    when 'savings_goal' then category.financial_role in ('emergency_reserve', 'savings', 'other')
    when 'subscription' then category.financial_role in ('essential', 'discretionary', 'other')
    else false
  end, false);

create or replace function public.enforce_category_financial_purpose()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_is_compatible boolean;
begin
  if new.category_level <> 'super' then
    return new;
  end if;

  v_is_compatible := case new.category_type
    when 'expense' then new.financial_role in ('essential', 'debt_obligation', 'discretionary', 'other')
    when 'income' then new.financial_role in ('income', 'other')
    when 'account' then new.financial_role in ('emergency_reserve', 'savings', 'other')
    when 'asset' then new.financial_role in ('savings', 'discretionary', 'other')
    when 'debt' then new.financial_role in ('debt_obligation', 'other')
    when 'savings_goal' then new.financial_role in ('emergency_reserve', 'savings', 'other')
    when 'subscription' then new.financial_role in ('essential', 'discretionary', 'other')
    else false
  end;

  if not coalesce(v_is_compatible, false) then
    raise exception 'Choose a financial purpose compatible with this category type.';
  end if;

  return new;
end;
$$;

create trigger enforce_category_purpose_before_write
before insert or update of category_type, category_level, financial_role
on public.categories
for each row
execute function public.enforce_category_financial_purpose();

comment on function public.enforce_category_financial_purpose() is
  'Prevents Debit, Credit, and page-category reporting groups from using incompatible financial purposes.';
