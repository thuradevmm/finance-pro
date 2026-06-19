WITH ledger AS (
  SELECT
    t.user_id,
    t.account_id,
    t.id AS transaction_id,
    t.transaction_date,
    t.amount AS signed_amount
  FROM
    transactions t
  WHERE
    (
      (t.deleted_at IS NULL)
      AND (t.status = 'posted' :: text)
      AND (t.type = 'income' :: text)
      AND (t.account_id IS NOT NULL)
    )
  UNION
  ALL
  SELECT
    t.user_id,
    t.account_id,
    t.id AS transaction_id,
    t.transaction_date,
    (- t.amount) AS signed_amount
  FROM
    transactions t
  WHERE
    (
      (t.deleted_at IS NULL)
      AND (t.status = 'posted' :: text)
      AND (t.type = 'expense' :: text)
      AND (t.account_id IS NOT NULL)
    )
  UNION
  ALL
  SELECT
    t.user_id,
    t.account_id,
    t.id AS transaction_id,
    t.transaction_date,
    (- t.amount) AS signed_amount
  FROM
    transactions t
  WHERE
    (
      (t.deleted_at IS NULL)
      AND (t.status = 'posted' :: text)
      AND (t.type = 'transfer' :: text)
      AND (t.account_id IS NOT NULL)
    )
  UNION
  ALL
  SELECT
    t.user_id,
    t.transfer_account_id AS account_id,
    t.id AS transaction_id,
    t.transaction_date,
    t.amount AS signed_amount
  FROM
    transactions t
  WHERE
    (
      (t.deleted_at IS NULL)
      AND (t.status = 'posted' :: text)
      AND (t.type = 'transfer' :: text)
      AND (t.transfer_account_id IS NOT NULL)
    )
)
SELECT
  a.id AS account_id,
  a.user_id,
  a.name,
  a.type,
  a.currency_code,
  a.initial_balance,
  (
    a.initial_balance + COALESCE(sum(l.signed_amount), (0) :: numeric)
  ) AS current_balance,
  a.is_active,
  a.sort_order,
  a.created_at,
  a.updated_at
FROM
  (
    accounts a
    LEFT JOIN ledger l ON ((l.account_id = a.id))
  )
WHERE
  (a.deleted_at IS NULL)
GROUP BY
  a.id,
  a.user_id,
  a.name,
  a.type,
  a.currency_code,
  a.initial_balance,
  a.is_active,
  a.sort_order,
  a.created_at,
  a.updated_at;