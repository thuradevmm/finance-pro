-- Percentage-based savings contributions use available planned surplus, not
-- gross planned income. Preserve every existing percentage and explicitly
-- annotate its basis so old and new records share the same meaning.

update public.savings_goals
set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('contribution_basis', 'surplus')
where lower(coalesce(contribution_type, metadata ->> 'contribution_type', '')) = 'percentage'
  and metadata ->> 'contribution_basis' is distinct from 'surplus';

comment on column public.savings_goals.contribution_percentage is
  'Share of non-negative planned surplus (planned Credit minus planned Debit before savings).';

comment on column public.future_planning_amounts.percentage is
  'For saving columns, share of non-negative monthly planned surplus; for expense and neutral columns, share of monthly planned Credit.';
