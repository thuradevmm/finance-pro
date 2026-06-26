alter table if exists public.transactions
drop constraint if exists chk_transaction_transfer_accounts;

alter table if exists public.transactions
add constraint chk_transaction_transfer_accounts
check (
  (
    lower(type) = 'transfer'
    and account_id is not null
    and transfer_account_id is not null
    and (
      transfer_account_id <> account_id
      or nullif(metadata->>'account_amount_type', '') is distinct from nullif(metadata->>'transfer_account_amount_type', '')
    )
  )
  or (
    lower(type) <> 'transfer'
    and transfer_account_id is null
  )
);
