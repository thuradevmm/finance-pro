SELECT
  user_id,
  (
    date_trunc(
      'year' :: text,
      (transaction_date) :: timestamp WITH time zone
    )
  ) :: date AS year,
  sum(
    CASE
      WHEN (TYPE = 'income' :: text) THEN amount
      ELSE (0) :: numeric
    END
  ) AS total_income,
  sum(
    CASE
      WHEN (TYPE = 'expense' :: text) THEN amount
      ELSE (0) :: numeric
    END
  ) AS total_expense,
  (
    sum(
      CASE
        WHEN (TYPE = 'income' :: text) THEN amount
        ELSE (0) :: numeric
      END
    ) - sum(
      CASE
        WHEN (TYPE = 'expense' :: text) THEN amount
        ELSE (0) :: numeric
      END
    )
  ) AS net_amount,
  count(*) AS transaction_count
FROM
  transactions
WHERE
  (
    (deleted_at IS NULL)
    AND (STATUS = 'posted' :: text)
  )
GROUP BY
  user_id,
  (
    (
      date_trunc(
        'year' :: text,
        (transaction_date) :: timestamp WITH time zone
      )
    ) :: date
  );